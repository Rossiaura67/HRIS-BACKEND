import { Request, Response } from "express";
import { Prisma, SubscriptionStatus, PaymentStatus, Role } from "@prisma/client";
import prisma from "../utils/prisma";
import { AuthRequest } from "../middlewares/auth.middleware";
import crypto from "crypto";

const midtransClient = require('midtrans-client');

const snap = new midtransClient.Snap({
    isProduction: false,
    serverKey: process.env.MIDTRANS_SERVER_KEY, 
    clientKey: process.env.MIDTRANS_CLIENT_KEY
});

/**
 * HELPER: Logika Aktivasi & Stacking
 * Dipusatkan untuk menghindari tumpang tindih logika antara Webhook dan Manual Approval
 */
export async function processSubscriptionActivation(transactionId: number, tx: Prisma.TransactionClient) {
    const trx = await tx.transaction.findUnique({ where: { id: transactionId } });
    if (!trx) throw new Error("Transaksi tidak ditemukan.");
    if (trx.status === PaymentStatus.Success) return; // Mencegah aktivasi ganda (Idempotent)

    // 1. Update status transaksi
    await tx.transaction.update({
        where: { id: trx.id },
        data: { status: PaymentStatus.Success, paidAt: new Date() }
    });

    const currentSub = await tx.subscription.findUnique({ where: { companyId: trx.companyId } });
    const now = new Date();
    
    // Logika Stacking: Jika paket masih aktif, durasi ditambahkan ke sisa masa aktif
    let startDate = now;
    if (currentSub && currentSub.status === SubscriptionStatus.Active && currentSub.endDate > now) {
        startDate = new Date(currentSub.endDate);
    }

    const newEndDate = new Date(startDate);
    newEndDate.setDate(newEndDate.getDate() + trx.durationSnapshot);

    // 2. Update/Upsert Langganan (Atomic Update)
    await tx.subscription.upsert({
        where: { companyId: trx.companyId },
        update: {
            planName: trx.planName,
            status: SubscriptionStatus.Active,
            endDate: newEndDate,
            maxEmployees: trx.maxEmployeesSnapshot,
            price: trx.amount,
            lastTransactionId: trx.id
        },
        create: {
            companyId: trx.companyId,
            planName: trx.planName,
            status: SubscriptionStatus.Active,
            startDate: now,
            endDate: newEndDate,
            maxEmployees: trx.maxEmployeesSnapshot,
            price: trx.amount,
            lastTransactionId: trx.id
        }
    });
}

/**
 * 1. PUBLIC: GET AVAILABLE PLANS
 */
export const getAvailablePlans = async (req: Request, res: Response) => {
    try {
        const plans = await prisma.masterPlan.findMany({
            where: { isActive: true },
            orderBy: { price: 'asc' }
        });
        return res.json({ success: true, data: plans });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * 2. WEBHOOK: MIDTRANS NOTIFICATION
 */
export const handlePaymentWebhook = async (req: Request, res: Response) => {
    try {
        const { order_id, status_code, gross_amount, transaction_status, signature_key } = req.body;
        const serverKey = process.env.MIDTRANS_SERVER_KEY!;
        
        const hash = crypto.createHash('sha512')
            .update(`${order_id}${status_code}${gross_amount}${serverKey}`)
            .digest('hex');

        if (signature_key !== hash) return res.status(401).json({ message: "Invalid signature" });

        const trx = await prisma.transaction.findUnique({ where: { referenceId: order_id } });
        if (!trx || trx.status === PaymentStatus.Success) return res.status(200).json({ message: "Ignored" });

        if (['capture', 'settlement'].includes(transaction_status)) {
            await prisma.$transaction(async (tx) => {
                await processSubscriptionActivation(trx.id, tx);
            });
        } else if (['deny', 'cancel', 'expire'].includes(transaction_status)) {
            await prisma.transaction.update({ where: { id: trx.id }, data: { status: PaymentStatus.Failed } });
        }
        return res.status(200).json({ success: true });
    } catch (error: any) { 
        return res.status(500).json({ message: error.message }); 
    }
};

/**
 * 3. TENANT: GET MY SUBSCRIPTION
 */
export const getMySubscription = async (req: AuthRequest, res: Response) => {
    try {
        const companyId = req.user!.companyId!;
        const sub = await prisma.subscription.findUnique({
            where: { companyId },
            include: { 
                company: { 
                    select: { _count: { select: { users: { where: { role: Role.employee } } } } } 
                } 
            }
        });

        if (!sub) return res.json({ success: false, message: "No active subscription" });
        
        const now = new Date();
        const daysLeft = Math.max(0, Math.ceil((new Date(sub.endDate).getTime() - now.getTime()) / (1000 * 3600 * 24)));

        return res.json({ 
            success: true, 
            data: { ...sub, daysLeft, activeEmployees: sub.company._count.users } 
        });
    } catch (error) { 
        return res.status(500).json({ success: false }); 
    }
};

/**
 * 4. TENANT: CREATE CHECKOUT
 */
export const createCheckout = async (req: AuthRequest, res: Response) => {
    try {
        const { planId, method = "MIDTRANS" } = req.body;
        const companyId = req.user!.companyId!;

        const plan = await prisma.masterPlan.findUnique({ where: { id: Number(planId) } });
        if (!plan) return res.status(404).json({ message: "Plan not found" });

        const currentEmployees = await prisma.user.count({ where: { companyId, role: Role.employee } });
        if (currentEmployees > plan.maxEmployees) {
            return res.status(400).json({ success: false, message: `Limit karyawan paket ini (${plan.maxEmployees}) di bawah jumlah karyawan saat ini (${currentEmployees}).` });
        }

        const refId = `${method === "MIDTRANS" ? "INV" : "MANUAL"}-${Date.now()}`;

        const transaction = await prisma.transaction.create({
            data: { 
                companyId, planId: plan.id, referenceId: refId, invoiceId: refId, 
                planName: plan.name, amount: plan.price, 
                maxEmployeesSnapshot: plan.maxEmployees, durationSnapshot: plan.durationDays,
                paymentMethod: method === "MIDTRANS" ? "MIDTRANS" : "MANUAL_TRANSFER",
                proofOfPayment: method === "MANUAL_TRANSFER" ? (req.file?.filename) : undefined
            }
        });

        if (method === "MIDTRANS") {
            const midtransResponse = await snap.createTransaction({
                transaction_details: { order_id: refId, gross_amount: Math.round(Number(plan.price)) },
                customer_details: { first_name: req.user!.name, email: req.user!.email }
            });
            await prisma.transaction.update({ where: { id: transaction.id }, data: { snapToken: midtransResponse.token } });
            return res.status(201).json({ success: true, snapToken: midtransResponse.token });
        }

        return res.status(201).json({ success: true, message: "Checkout manual berhasil. Menunggu bukti transfer." });
    } catch (error: any) { 
        return res.status(500).json({ success: false, message: error.message }); 
    }
};

/**
 * 5. SUPERADMIN: APPROVE MANUAL PAYMENT
 */
export const approveManualPayment = async (req: Request, res: Response) => {
    try {
        const { transactionId } = req.params;

        const trx = await prisma.transaction.findUnique({ where: { id: Number(transactionId) } });
        if (!trx || trx.status !== PaymentStatus.Pending) {
            return res.status(400).json({ success: false, message: "Transaksi tidak valid untuk disetujui." });
        }

        await prisma.$transaction(async (tx) => {
            await processSubscriptionActivation(trx.id, tx);
        });

        return res.json({ success: true, message: "Pembayaran manual disetujui, paket telah aktif." });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * 6. TENANT: HISTORY
 */
export const getTransactionHistory = async (req: AuthRequest, res: Response) => {
    try {
        const data = await prisma.transaction.findMany({ 
            where: { companyId: req.user!.companyId! }, 
            orderBy: { created_at: "desc" } 
        });
        return res.json({ success: true, data });
    } catch (error) { 
        return res.status(500).json({ success: false }); 
    }
};

export const getTransactionDetail = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const companyId = req.user!.companyId!;

        const transaction = await prisma.transaction.findFirst({
            where: {
                id: Number(id),
                companyId: companyId // Pastikan admin hanya bisa melihat transaksi perusahaannya sendiri
            },
            include: {
                company: { select: { name: true } }
            }
        });

        if (!transaction) {
            return res.status(404).json({ success: false, message: "Detail transaksi tidak ditemukan." });
        }

        return res.json({ success: true, data: transaction });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};