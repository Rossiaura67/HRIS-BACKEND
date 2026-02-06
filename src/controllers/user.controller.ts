import { Response } from "express";
import prisma from "../utils/prisma";
import { AuthRequest } from "../middlewares/auth.middleware";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import { Role, UserStatus, SubscriptionStatus } from "@prisma/client";

const PROFILE_PATH = "public/profiles";

const deleteOldImage = (filename: string | null | undefined) => {
    if (filename) {
        const filePath = path.join(process.cwd(), PROFILE_PATH, filename);
        if (fs.existsSync(filePath)) {
            try { fs.unlinkSync(filePath); } catch (err) { console.error("File deletion failed:", err); }
        }
    }
};

/**
 * ==========================================
 * ROLE: ALL USERS (SELF SERVICE)
 * ==========================================
 */

export const updateProfile = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const companyId = req.user!.companyId;
        const { name, phone, bank_account, bank_name, bank_holder_name, gender } = req.body;
        
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) return res.status(404).json({ success: false, message: "User tidak ditemukan" });

        const isBankChanged = (bank_account && bank_account !== user.bank_account) || 
                             (bank_name && bank_name !== user.bank_name);

        let profile_image = user.profile_image;
        if (req.file) {
            deleteOldImage(user.profile_image);
            profile_image = req.file.filename;
        }

        const updated = await prisma.user.update({ 
            where: { id: userId }, 
            data: { 
                name: name || user.name, 
                phone: phone || user.phone, 
                bank_account: bank_account || user.bank_account, 
                bank_name: bank_name || user.bank_name, 
                bank_holder_name: bank_holder_name || user.bank_holder_name, 
                gender: gender || user.gender, 
                profile_image 
            } 
        });

        if (isBankChanged && companyId) {
            const admins = await prisma.user.findMany({
                where: { companyId, role: Role.admin, status: UserStatus.Active },
                select: { id: true }
            });

            await prisma.$transaction([
                prisma.notification.createMany({
                    data: admins.map(admin => ({
                        userId: admin.id,
                        title: "Audit: Perubahan Rekening",
                        message: `Karyawan ${updated.name} telah memperbarui data bank.`,
                    }))
                }),
                prisma.auditLog.create({
                    data: {
                        companyId, userId, actorRole: req.user!.role as Role,
                        action: "UPDATE_BANK_INFO",
                        details: `Mengubah data bank dari ${user.bank_name || '-'} ke ${bank_name}.`
                    }
                })
            ]);
        }

        return res.json({ success: true, message: "Profil diperbarui", data: updated });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const uploadProfileImage = async (req: AuthRequest, res: Response) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: "File tidak ditemukan" });
        const userId = req.user!.id;
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) return res.status(404).json({ success: false, message: "User tidak ditemukan" });

        const oldImage = user.profile_image;
        await prisma.user.update({
            where: { id: userId },
            data: { profile_image: req.file.filename }
        });

        if (oldImage) deleteOldImage(oldImage);

        return res.json({ success: true, message: "Foto profil berhasil diperbarui", filename: req.file.filename });
    } catch (error: any) {
        if (req.file) deleteOldImage(req.file.filename);
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const changePassword = async (req: AuthRequest, res: Response) => {
    try {
        const { oldPassword, newPassword } = req.body;
        const user = await prisma.user.findUnique({ where: { id: req.user!.id } });

        if (!user || !(await bcrypt.compare(oldPassword, user.password))) {
            return res.status(400).json({ success: false, message: "Password lama salah" });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await prisma.user.update({ where: { id: user.id }, data: { password: hashedPassword } });

        return res.json({ success: true, message: "Password berhasil diganti" });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const getMyNotifications = async (req: AuthRequest, res: Response) => {
    try {
        const notifications = await prisma.notification.findMany({
            where: { userId: req.user!.id },
            orderBy: { created_at: 'desc' },
            take: 20
        });
        return res.json({ success: true, data: notifications });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const markNotificationAsRead = async (req: AuthRequest, res: Response) => {
    try {
        await prisma.notification.updateMany({
            where: { userId: req.user!.id, is_read: false },
            data: { is_read: true }
        });
        return res.json({ success: true, message: "Notifikasi telah dibaca" });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * ==========================================
 * ROLE: ADMIN & SUPERADMIN
 * ==========================================
 */

export const getAllUsers = async (req: AuthRequest, res: Response) => {
    try {
        const { companyId, role } = req.user!;
        const users = await prisma.user.findMany({
            where: { 
                companyId: role === Role.superadmin ? undefined : companyId,
                role: role === Role.superadmin ? undefined : Role.employee
            },
            include: { position: { select: { positionName: true } } },
            orderBy: { name: 'asc' }
        });
        return res.json({ success: true, data: users });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const getUserById = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { companyId, role } = req.user!;

        const user = await prisma.user.findFirst({
            where: { 
                id: Number(id), 
                companyId: role === Role.superadmin ? undefined : companyId 
            },
            include: { position: true, company: true }
        });

        if (!user || (role !== Role.superadmin && user.role === Role.superadmin)) {
            return res.status(404).json({ success: false, message: "Data tidak ditemukan." });
        }

        const { password, ...userData } = user;
        return res.json({ success: true, data: userData });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const createUser = async (req: AuthRequest, res: Response) => {
    try {
        const admin = req.user!;
        const { email, employeeId, annual_leave_quota, password, positionId, join_date, role, companyId: targetCompanyId, ...rest } = req.body;

        const finalCompanyId = admin.role === Role.superadmin ? (targetCompanyId ? Number(targetCompanyId) : null) : admin.companyId;
        const finalRole = admin.role === Role.superadmin ? (role as Role || Role.superadmin) : Role.employee;

        if (admin.role !== Role.superadmin) {
            const sub = await prisma.subscription.findUnique({ where: { companyId: admin.companyId! } });
            if (!sub || sub.status !== SubscriptionStatus.Active) return res.status(403).json({ success: false, message: "Langganan tidak aktif." });
            
            const count = await prisma.user.count({ where: { companyId: admin.companyId, status: UserStatus.Active, role: Role.employee } });
            if (count >= sub.maxEmployees) return res.status(403).json({ success: false, message: "Kuota paket langganan penuh." });
        }

        // PENTING: Cek Email ATAU NIK yang sudah ada
        const exist = await prisma.user.findFirst({
            where: { OR: [{ email }, { employeeId }] }
        });
        if (exist) return res.status(400).json({ success: false, message: "Email atau NIK sudah terdaftar." });

        const hashedPassword = await bcrypt.hash(password || "123456", 10);

        const newUser = await prisma.$transaction(async (tx) => {
            const user = await tx.user.create({
                data: {
                    ...rest,
                    email, employeeId, companyId: finalCompanyId, role: finalRole,
                    password: hashedPassword,
                    profile_image: req.file ? req.file.filename : null,
                    join_date: join_date ? new Date(join_date) : new Date(),
                    positionId: positionId ? Number(positionId) : null,
                    annual_leave_quota: Number(annual_leave_quota) || 12,
                    leave_balance: Number(annual_leave_quota) || 12,
                }
            });

            await tx.auditLog.create({
                data: { 
                    companyId: finalCompanyId, userId: admin.id, actorRole: admin.role as Role, 
                    action: "CREATE_USER", details: `Mendaftarkan user baru: ${email}` 
                }
            });
            return user;
        });

        return res.status(201).json({ success: true, message: "Berhasil didaftarkan", data: newUser });
    } catch (error: any) {
        if (req.file) deleteOldImage(req.file.filename);
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const updateUser = async (req: AuthRequest, res: Response) => {
    try {
        const admin = req.user!;
        const { id } = req.params;
        const { annual_leave_quota, positionId, role, ...rest } = req.body;

        const target = await prisma.user.findUnique({ where: { id: Number(id) } });
        if (!target) return res.status(404).json({ success: false, message: "User tidak ditemukan." });

        // Proteksi agar Admin tidak edit user perusahaan lain
        if (admin.role !== Role.superadmin && target.companyId !== admin.companyId) {
            return res.status(403).json({ success: false, message: "Akses ditolak." });
        }

        const newQuota = annual_leave_quota ? Number(annual_leave_quota) : target.annual_leave_quota;
        const diff = newQuota - target.annual_leave_quota;

        const updated = await prisma.user.update({
            where: { id: Number(id) },
            data: {
                ...rest,
                role: admin.role === Role.superadmin ? (role as Role) : target.role,
                positionId: positionId ? Number(positionId) : target.positionId,
                annual_leave_quota: newQuota,
                leave_balance: target.leave_balance + diff,
                profile_image: req.file ? req.file.filename : target.profile_image
            }
        });

        if (req.file) deleteOldImage(target.profile_image);

        await prisma.auditLog.create({
            data: { 
                companyId: target.companyId, userId: admin.id, actorRole: admin.role as Role, 
                action: "UPDATE_USER", details: `Memperbarui data karyawan ID: ${id}` 
            }
        });

        return res.json({ success: true, message: "Data berhasil diperbarui", data: updated });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const updateUserStatus = async (req: AuthRequest, res: Response) => {
    try {
        const { status } = req.body;
        const { id } = req.params;
        const { companyId, role } = req.user!;

        await prisma.user.update({
            where: { id: Number(id), companyId: role === Role.superadmin ? undefined : companyId! },
            data: { status: status as UserStatus }
        });
        return res.json({ success: true, message: "Status karyawan diperbarui" });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const deleteUser = async (req: AuthRequest, res: Response) => {
    try {
        const targetId = Number(req.params.id);
        const { companyId, role, id: adminId } = req.user!;

        if (targetId === adminId) return res.status(400).json({ success: false, message: "Tidak bisa menghapus akun sendiri." });

        await prisma.user.update({
            where: { id: targetId, companyId: role === Role.superadmin ? undefined : companyId! },
            data: { status: UserStatus.Inactive }
        });

        return res.json({ success: true, message: "Karyawan telah dinonaktifkan." });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const adminResetPassword = async (req: AuthRequest, res: Response) => {
    try {
        const hashedPassword = await bcrypt.hash(req.body.newPassword || "123456", 10);
        const { companyId, role } = req.user!;

        await prisma.user.update({
            where: { id: Number(req.params.id), companyId: role === Role.superadmin ? undefined : companyId! },
            data: { password: hashedPassword }
        });
        return res.json({ success: true, message: "Password karyawan berhasil direset" });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const getPositions = async (req: AuthRequest, res: Response) => {
    try {
        const data = await prisma.positionSalary.findMany({
            where: { companyId: req.user!.companyId! },
            orderBy: { positionName: 'asc' }
        });
        return res.json({ success: true, data });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};