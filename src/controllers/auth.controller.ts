import { Request, Response } from "express";
import prisma from "../utils/prisma";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import { validationResult } from "express-validator";
import crypto from "crypto";
import { OAuth2Client } from "google-auth-library"; 
import { Role, UserStatus, SubscriptionStatus, ContractType } from "@prisma/client";
import { AuthRequest } from "../middlewares/auth.middleware";

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/**
 * HELPER: Validasi Akses Tenant & Langganan
 */
const validateTenantAccess = (user: any) => {
    // 1. Superadmin Bypass
    if (user.role === Role.superadmin) return { valid: true };

    // 2. Proteksi Status Akun Individu (Penting: Karyawan yang dihapus/non-aktif tidak bisa masuk)
    if (user.status !== UserStatus.Active) {
        return { valid: false, message: "Akun Anda telah dinonaktifkan. Silakan hubungi Admin." };
    }

    // 3. Proteksi Perusahaan
    if (!user.company || user.company.status !== UserStatus.Active) {
        return { valid: false, message: "Akses ditolak: Instansi Anda sedang ditangguhkan." };
    }

    const sub = user.company.subscription;
    if (!sub) return { valid: false, message: "Perusahaan belum memiliki paket langganan aktif." };

    const now = new Date();
    const isExpired = sub.status === SubscriptionStatus.Expired || new Date(sub.endDate) < now;

    // Logika SaaS: Hanya Admin yang boleh masuk saat expired untuk membayar tagihan (Billing)
    if (isExpired && user.role !== Role.admin) {
        return { valid: false, message: "Masa aktif aplikasi telah berakhir. Hubungi Admin Anda." };
    }

    return { valid: true, isExpired };
};

/**
 * ==========================================
 * ROLE: SUPERADMIN (SYSTEM INITIALIZATION)
 * ==========================================
 */

export const createInitialSuperadmin = async (req: Request, res: Response) => {
    try {
        const { name, email, password } = req.body;

        if (!email.endsWith("@supersuper")) return res.status(403).json({ success: false, message: "Domain email terlarang." });
        
        const systemPass = process.env.SYSTEM_SUPER_PASSWORD;
        if (!systemPass || password !== systemPass) return res.status(401).json({ success: false, message: "Password sistem salah." });

        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) return res.status(400).json({ success: false, message: "Sudah terdaftar." });

        const hashedPassword = await bcrypt.hash(password, 10);
        await prisma.user.create({
            data: {
                name, email, password: hashedPassword, role: Role.superadmin, status: UserStatus.Active,
                is_verified: true, contract_type: ContractType.Tetap
            }
        });

        return res.status(201).json({ success: true, message: "Superadmin diinisialisasi." });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * ==========================================
 * ROLE: ADMIN (TENANT REGISTRATION)
 * ==========================================
 */

export const register = async (req: Request, res: Response) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

        const { name, email, password, companyName } = req.body;

        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) return res.status(400).json({ success: false, message: "Email sudah digunakan." });

        const existingCompany = await prisma.company.findFirst({ where: { name: companyName } });
        if (existingCompany) return res.status(400).json({ success: false, message: "Nama perusahaan sudah terdaftar." });

        const hashedPassword = await bcrypt.hash(password, 10);

        const result = await prisma.$transaction(async (tx) => {
            const company = await tx.company.create({ data: { name: companyName, status: UserStatus.Active } });

            await tx.subscription.create({
                data: {
                    companyId: company.id, planName: "Trial Free", status: SubscriptionStatus.Trial,
                    endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), maxEmployees: 10
                }
            });

            const newUser = await tx.user.create({
                data: {
                    name, email, password: hashedPassword, role: Role.admin, companyId: company.id,
                    status: UserStatus.Active, is_verified: true, contract_type: ContractType.Tetap,
                    employeeId: `ADM-${company.id}-${Math.floor(100 + Math.random() * 899)}`
                }
            });

            await tx.auditLog.create({
                data: { 
                    companyId: company.id, userId: newUser.id, actorRole: Role.admin,
                    action: "REGISTER_TENANT", details: `Pendaftaran tenant baru: ${companyName}`
                }
            });

            return { newUser, company };
        });

        return res.status(201).json({ success: true, data: result });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * ==========================================
 * ROLE: ALL ROLES (AUTHENTICATION)
 * ==========================================
 */

export const login = async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body;

        const user = await prisma.user.findUnique({
            where: { email },
            include: { company: { include: { subscription: true } }, position: { select: { positionName: true } } }
        });

        if (!user) return res.status(404).json({ success: false, message: "Akun tidak ditemukan." });

        const access = validateTenantAccess(user);
        if (!access.valid) return res.status(403).json({ success: false, message: access.message });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ success: false, message: "Password salah." });

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role, companyId: user.companyId, name: user.name },
            process.env.JWT_SECRET!, { expiresIn: "1d" }
        );

        await prisma.$transaction([
            prisma.user.update({ where: { id: user.id }, data: { last_login: new Date() } }),
            prisma.auditLog.create({
                data: { 
                    companyId: user.companyId, userId: user.id, actorRole: user.role as Role,
                    action: "LOGIN", details: "Login berhasil via email."
                }
            })
        ]);

        return res.json({ 
            success: true, token, 
            user: { 
                id: user.id, name: user.name, role: user.role, companyId: user.companyId,
                companyName: user.company?.name || "Global System",
                position: user.position?.positionName || (user.role === Role.superadmin ? "Root" : "Staff"),
                isExpired: access.isExpired ?? false 
            } 
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Gagal memproses login." });
    }
};

export const googleLogin = async (req: Request, res: Response) => {
    try {
        const { idToken } = req.body; 
        const ticket = await googleClient.verifyIdToken({ idToken, audience: process.env.GOOGLE_CLIENT_ID });
        
        const payload = ticket.getPayload();
        if (!payload?.email) return res.status(400).json({ message: "Token tidak valid." });

        const user = await prisma.user.findUnique({
            where: { email: payload.email },
            include: { company: { include: { subscription: true } } }
        });

        if (!user) return res.status(401).json({ success: false, message: "Email belum terdaftar." });

        const access = validateTenantAccess(user);
        if (!access.valid) return res.status(403).json({ success: false, message: access.message });

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role, companyId: user.companyId, name: user.name },
            process.env.JWT_SECRET!, { expiresIn: "1d" }
        );

        await prisma.$transaction([
            prisma.user.update({ where: { id: user.id }, data: { last_login: new Date() } }),
            prisma.auditLog.create({
                data: {
                    companyId: user.companyId, userId: user.id, actorRole: user.role as Role,
                    action: "LOGIN_GOOGLE", details: "Login berhasil via Google SSO."
                }
            })
        ]);

        return res.json({ success: true, token, user: { id: user.id, name: user.name, role: user.role, companyId: user.companyId } });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Google Login gagal." });
    }
};

export const logout = async (req: AuthRequest, res: Response) => {
    try {
        const user = req.user!;
        await prisma.$transaction([
            prisma.auditLog.create({
                data: { companyId: user.companyId, userId: user.id, actorRole: user.role as Role, action: "LOGOUT", details: "User logout." }
            }),
            prisma.user.update({ where: { id: user.id }, data: { fcm_token: null } })
        ]);
        return res.json({ success: true, message: "Logout berhasil." });
    } catch (error) {
        return res.status(500).json({ success: false });
    }
};

/**
 * ==========================================
 * ROLE: ALL ROLES (PROFILE & RECOVERY)
 * ==========================================
 */

export const getMe = async (req: AuthRequest, res: Response) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user!.id },
            select: {
                id: true, name: true, email: true, role: true, employeeId: true, profile_image: true, leave_balance: true,
                company: { select: { id: true, name: true, logo: true, subscription: { select: { planName: true, status: true, endDate: true } } } },
                position: { select: { positionName: true } }
            }
        });
        return res.json({ success: true, data: user });
    } catch (error) {
        return res.status(500).json({ success: false });
    }
};

export const forgotPassword = async (req: Request, res: Response) => {
    try {
        const { email } = req.body;
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return res.status(404).json({ success: false, message: "Email tidak ditemukan." });

        const token = crypto.randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); 

        await prisma.user.update({ where: { email }, data: { reset_token: token, reset_token_expired: expiresAt } });

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
        });

        const resetUrl = `${process.env.CLIENT_URL}/Auth/reset-password/${token}`;
        await transporter.sendMail({
            from: '"HRIS System" <no-reply@kamu.com>',
            to: email,
            subject: "Reset Password",
            html: `<p>Klik untuk reset password: <a href="${resetUrl}">${resetUrl}</a></p>`
        });

        return res.json({ success: true, message: "Link reset dikirim ke email." });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Gagal mengirim email." });
    }
};

export const resetPassword = async (req: Request, res: Response) => {
    try {
        const { token } = req.params;
        const { password } = req.body;

        const user = await prisma.user.findFirst({
            where: { reset_token: token, reset_token_expired: { gt: new Date() } },
        });

        if (!user) return res.status(400).json({ success: false, message: "Token kadaluarsa." });

        const hashedPassword = await bcrypt.hash(password, 10);
        await prisma.user.update({
            where: { id: user.id },
            data: { password: hashedPassword, reset_token: null, reset_token_expired: null },
        });

        return res.json({ success: true, message: "Password diperbarui." });
    } catch (error) {
        return res.status(500).json({ success: false });
    }
};