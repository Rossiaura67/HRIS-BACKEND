import { Response } from "express";
import { Prisma, Role, SubscriptionStatus, PaymentStatus, UserStatus } from "@prisma/client";
import prisma from "../utils/prisma";
import { AuthRequest } from "../middlewares/auth.middleware";
import { processSubscriptionActivation } from "./subscription.controller"; 

/**
 * 1. PLATFORM ANALYTICS
 */
export const getPlatformMetrics = async (req: AuthRequest, res: Response) => {
    try {
        const [totalTenants, totalUsers, revenueData, recentTenants, planDistribution] = await Promise.all([
            prisma.company.count(),
            prisma.user.count({ where: { role: Role.employee, status: "Active" } }),
            prisma.transaction.aggregate({ where: { status: "Success" }, _sum: { amount: true } }),
            prisma.company.findMany({
                take: 5,
                orderBy: { created_at: 'desc' },
                include: { subscription: { select: { planName: true, status: true } } }
            }),
            prisma.subscription.groupBy({
                by: ['planName'],
                _count: { planName: true }
            })
        ]);

        // SINKRONISASI GRAFIK: Recharts butuh key "name" dan "value"
        const formattedPlanDistribution = planDistribution.map(p => ({
            name: p.planName || "Trial",
            value: Number(p._count.planName)
        }));

        return res.json({
            success: true,
            data: {
                totalTenants,
                totalUsers, // Sesuai dengan data?.totalUsers di Frontend
                totalRevenue: Number(revenueData._sum.amount || 0), // Sesuai dengan data?.totalRevenue
                recentTenants: recentTenants.map(t => ({
                    id: t.id,
                    name: t.name,
                    plan: t.subscription?.planName || "Trial",
                    status: t.subscription?.status || "Active"
                })),
                planDistribution: formattedPlanDistribution // Array [{name, value}]
            }
        });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * 2. TENANT MANAGEMENT
 */
export const getAllTenants = async (req: AuthRequest, res: Response) => {
    // Ambil page dan limit dari query string
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const [tenants, total] = await Promise.all([
        prisma.company.findMany({ 
            skip, 
            take: limit, 
            include: { subscription: true, _count: { select: { users: true } } }, 
            orderBy: { created_at: 'desc' } 
        }),
        prisma.company.count()
    ]);

    return res.json({ 
        success: true, 
        data: tenants,
        meta: {
            total,
            page,
            lastPage: Math.ceil(total / limit)
        }
    });
};

export const getTenantDetail = async (req: AuthRequest, res: Response) => {
    const tenant = await prisma.company.findUnique({
        where: { id: Number(req.params.id) },
        include: { subscription: true, users: { where: { role: Role.admin }, select: { name: true, email: true, phone: true } }, _count: { select: { users: true } } }
    });
    return tenant ? res.json({ success: true, data: tenant }) : res.status(404).json({ success: false });
};

export const updateTenantStatus = async (req: AuthRequest, res: Response) => {
    const tenant = await prisma.company.update({ where: { id: Number(req.params.id) }, data: { status: req.body.status } });
    return res.json({ success: true, data: tenant });
};

export const terminateTenantAccess = async (req: AuthRequest, res: Response) => {
    const { companyId } = req.params;
    await prisma.$transaction([
        prisma.company.update({ where: { id: Number(companyId) }, data: { status: UserStatus.Suspended } }),
        prisma.subscription.update({ where: { companyId: Number(companyId) }, data: { status: SubscriptionStatus.Expired } })
    ]);
    return res.json({ success: true, message: "Access terminated" });
};

/**
 * 3. MASTER PLAN (Product Catalog)
 */
export const getMasterPlans = async (req: AuthRequest, res: Response) => {
    const plans = await prisma.masterPlan.findMany({ orderBy: { price: 'asc' } });
    return res.json({ success: true, data: plans });
};

export const upsertMasterPlan = async (req: AuthRequest, res: Response) => {
    const { id, name, price, maxEmployees, durationDays, isActive, description } = req.body;
    const plan = await prisma.masterPlan.upsert({
        where: { id: id || 0 },
        update: { name, price: new Prisma.Decimal(price), maxEmployees: Number(maxEmployees), durationDays: Number(durationDays), isActive, description },
        create: { name, price: new Prisma.Decimal(price), maxEmployees: Number(maxEmployees), durationDays: Number(durationDays), isActive: isActive ?? true, description }
    });
    return res.json({ success: true, data: plan });
};

/**
 * 4. FINANCIAL AUDIT & MANUAL OVERRIDE
 */
export const getAllSystemTransactions = async (req: AuthRequest, res: Response) => {
    const transactions = await prisma.transaction.findMany({ include: { company: { select: { name: true } } }, orderBy: { created_at: 'desc' } });
    return res.json({ success: true, data: transactions });
};

export const manualTransactionActivation = async (req: AuthRequest, res: Response) => {
    try {
        const { transactionId } = req.params; // Sesuai dengan /:transactionId di rute

        await prisma.$transaction(async (tx) => {
            // Panggil helper yang sudah Anda buat sebelumnya
            await processSubscriptionActivation(Number(transactionId), tx);
        });

        return res.json({ success: true, message: "Aktivasi manual berhasil." });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const updateSubscription = async (req: AuthRequest, res: Response) => {
    const { companyId } = req.params;
    const updated = await prisma.subscription.update({ where: { companyId: Number(companyId) }, data: { ...req.body, endDate: req.body.endDate ? new Date(req.body.endDate) : undefined } });
    return res.json({ success: true, data: updated });
};

export const seedDefaultPlans = async (req: AuthRequest, res: Response) => {
    const plans = [
        { name: "Basic", price: new Prisma.Decimal(250000), maxEmployees: 20, durationDays: 30, isActive: true, description: "Small UMKM" },
        { name: "Pro", price: new Prisma.Decimal(750000), maxEmployees: 100, durationDays: 30, isActive: true, description: "Growing Business" }
    ];
    await prisma.masterPlan.createMany({ data: plans, skipDuplicates: true });
    return res.json({ success: true, message: "Default plans seeded" });
};

export const deleteTenant = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const companyId = Number(id);

        // 1. Cek jumlah pengguna di perusahaan tersebut
        const userCount = await prisma.user.count({
            where: { companyId }
        });

        // 2. Jalankan Logika Pengecekan
        if (userCount > 0) {
            return res.status(400).json({
                success: false,
                message: `Gagal menghapus! Tenant ini masih memiliki ${userCount} pengguna. Hapus semua pengguna terlebih dahulu.`
            });
        }

        // 3. Jika User sudah 0, hapus Tenant (Hard Delete)
        // Catatan: Pastikan di schema.prisma, relasi Company ke Subscription dsb. 
        // sudah diatur 'onDelete: Cascade' agar data terkait ikut terhapus.
        await prisma.company.delete({
            where: { id: companyId }
        });

        return res.json({
            success: true,
            message: "Tenant telah berhasil dihapus secara permanen karena sudah tidak memiliki pengguna."
        });

    } catch (error: any) {
        return res.status(500).json({ 
            success: false, 
            message: "Gagal menghapus tenant: " + error.message 
        });
    }
};

export const getMasterPlanDetail = async (req: AuthRequest, res: Response) => {
    const plan = await prisma.masterPlan.findUnique({
        where: { id: Number(req.params.id) }
    });
    return plan ? res.json({ success: true, data: plan }) : res.status(404).json({ success: false });
};

export const deleteMasterPlan = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        
        const inUse = await prisma.subscription.count({
            where: { planName: (await prisma.masterPlan.findUnique({ where: { id: Number(id) } }))?.name }
        });

        if (inUse > 0) {
            return res.status(400).json({ 
                success: false, 
                message: "Plan tidak bisa dihapus karena sedang digunakan oleh beberapa tenant." 
            });
        }

        await prisma.masterPlan.delete({ where: { id: Number(id) } });
        return res.json({ success: true, message: "Master Plan berhasil dihapus." });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};