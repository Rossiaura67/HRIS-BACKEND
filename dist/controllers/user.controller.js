"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPositions = exports.adminResetPassword = exports.deleteUser = exports.updateUserStatus = exports.updateUser = exports.createUser = exports.getUserById = exports.getAllUsers = exports.markNotificationAsRead = exports.getMyNotifications = exports.changePassword = exports.uploadProfileImage = exports.updateProfile = void 0;
const prisma_1 = __importDefault(require("../utils/prisma"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const client_1 = require("@prisma/client");
const PROFILE_PATH = "public/profiles";
const deleteOldImage = (filename) => {
    if (filename) {
        const filePath = path_1.default.join(process.cwd(), PROFILE_PATH, filename);
        if (fs_1.default.existsSync(filePath)) {
            try {
                fs_1.default.unlinkSync(filePath);
            }
            catch (err) {
                console.error("File deletion failed:", err);
            }
        }
    }
};
/**
 * ==========================================
 * ROLE: ALL USERS (SELF SERVICE)
 * ==========================================
 */
const updateProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const companyId = req.user.companyId;
        const { name, phone, bank_account, bank_name, bank_holder_name, gender } = req.body;
        const user = await prisma_1.default.user.findUnique({ where: { id: userId } });
        if (!user)
            return res.status(404).json({ success: false, message: "User tidak ditemukan" });
        const isBankChanged = (bank_account && bank_account !== user.bank_account) ||
            (bank_name && bank_name !== user.bank_name);
        let profile_image = user.profile_image;
        if (req.file) {
            deleteOldImage(user.profile_image);
            profile_image = req.file.filename;
        }
        const updated = await prisma_1.default.user.update({
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
            const admins = await prisma_1.default.user.findMany({
                where: { companyId, role: client_1.Role.admin, status: client_1.UserStatus.Active },
                select: { id: true }
            });
            await prisma_1.default.$transaction([
                prisma_1.default.notification.createMany({
                    data: admins.map(admin => ({
                        userId: admin.id,
                        title: "Audit: Perubahan Rekening",
                        message: `Karyawan ${updated.name} telah memperbarui data bank.`,
                    }))
                }),
                prisma_1.default.auditLog.create({
                    data: {
                        companyId, userId, actorRole: req.user.role,
                        action: "UPDATE_BANK_INFO",
                        details: `Mengubah data bank dari ${user.bank_name || '-'} ke ${bank_name}.`
                    }
                })
            ]);
        }
        return res.json({ success: true, message: "Profil diperbarui", data: updated });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
exports.updateProfile = updateProfile;
const uploadProfileImage = async (req, res) => {
    try {
        if (!req.file)
            return res.status(400).json({ success: false, message: "File tidak ditemukan" });
        const userId = req.user.id;
        const user = await prisma_1.default.user.findUnique({ where: { id: userId } });
        if (!user)
            return res.status(404).json({ success: false, message: "User tidak ditemukan" });
        const oldImage = user.profile_image;
        await prisma_1.default.user.update({
            where: { id: userId },
            data: { profile_image: req.file.filename }
        });
        if (oldImage)
            deleteOldImage(oldImage);
        return res.json({ success: true, message: "Foto profil berhasil diperbarui", filename: req.file.filename });
    }
    catch (error) {
        if (req.file)
            deleteOldImage(req.file.filename);
        return res.status(500).json({ success: false, message: error.message });
    }
};
exports.uploadProfileImage = uploadProfileImage;
const changePassword = async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body;
        const user = await prisma_1.default.user.findUnique({ where: { id: req.user.id } });
        if (!user || !(await bcryptjs_1.default.compare(oldPassword, user.password))) {
            return res.status(400).json({ success: false, message: "Password lama salah" });
        }
        const hashedPassword = await bcryptjs_1.default.hash(newPassword, 10);
        await prisma_1.default.user.update({ where: { id: user.id }, data: { password: hashedPassword } });
        return res.json({ success: true, message: "Password berhasil diganti" });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
exports.changePassword = changePassword;
const getMyNotifications = async (req, res) => {
    try {
        const notifications = await prisma_1.default.notification.findMany({
            where: { userId: req.user.id },
            orderBy: { created_at: 'desc' },
            take: 20
        });
        return res.json({ success: true, data: notifications });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
exports.getMyNotifications = getMyNotifications;
const markNotificationAsRead = async (req, res) => {
    try {
        await prisma_1.default.notification.updateMany({
            where: { userId: req.user.id, is_read: false },
            data: { is_read: true }
        });
        return res.json({ success: true, message: "Notifikasi telah dibaca" });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
exports.markNotificationAsRead = markNotificationAsRead;
/**
 * ==========================================
 * ROLE: ADMIN & SUPERADMIN
 * ==========================================
 */
const getAllUsers = async (req, res) => {
    try {
        const { companyId, role } = req.user;
        const users = await prisma_1.default.user.findMany({
            where: {
                companyId: role === client_1.Role.superadmin ? undefined : companyId,
                role: role === client_1.Role.superadmin ? undefined : client_1.Role.employee
            },
            include: { position: { select: { positionName: true } } },
            orderBy: { name: 'asc' }
        });
        return res.json({ success: true, data: users });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
exports.getAllUsers = getAllUsers;
const getUserById = async (req, res) => {
    try {
        const { id } = req.params;
        const { companyId, role } = req.user;
        const user = await prisma_1.default.user.findFirst({
            where: {
                id: Number(id),
                companyId: role === client_1.Role.superadmin ? undefined : companyId
            },
            include: { position: true, company: true }
        });
        if (!user || (role !== client_1.Role.superadmin && user.role === client_1.Role.superadmin)) {
            return res.status(404).json({ success: false, message: "Data tidak ditemukan." });
        }
        const { password, ...userData } = user;
        return res.json({ success: true, data: userData });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
exports.getUserById = getUserById;
const createUser = async (req, res) => {
    try {
        const admin = req.user;
        const { email, employeeId, annual_leave_quota, password, positionId, join_date, role, companyId: targetCompanyId, ...rest } = req.body;
        const finalCompanyId = admin.role === client_1.Role.superadmin ? (targetCompanyId ? Number(targetCompanyId) : null) : admin.companyId;
        const finalRole = admin.role === client_1.Role.superadmin ? (role || client_1.Role.superadmin) : client_1.Role.employee;
        if (admin.role !== client_1.Role.superadmin) {
            const sub = await prisma_1.default.subscription.findUnique({ where: { companyId: admin.companyId } });
            if (!sub || sub.status !== client_1.SubscriptionStatus.Active)
                return res.status(403).json({ success: false, message: "Langganan tidak aktif." });
            const count = await prisma_1.default.user.count({ where: { companyId: admin.companyId, status: client_1.UserStatus.Active, role: client_1.Role.employee } });
            if (count >= sub.maxEmployees)
                return res.status(403).json({ success: false, message: "Kuota paket langganan penuh." });
        }
        // PENTING: Cek Email ATAU NIK yang sudah ada
        const exist = await prisma_1.default.user.findFirst({
            where: { OR: [{ email }, { employeeId }] }
        });
        if (exist)
            return res.status(400).json({ success: false, message: "Email atau NIK sudah terdaftar." });
        const hashedPassword = await bcryptjs_1.default.hash(password || "123456", 10);
        const newUser = await prisma_1.default.$transaction(async (tx) => {
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
                    companyId: finalCompanyId, userId: admin.id, actorRole: admin.role,
                    action: "CREATE_USER", details: `Mendaftarkan user baru: ${email}`
                }
            });
            return user;
        });
        return res.status(201).json({ success: true, message: "Berhasil didaftarkan", data: newUser });
    }
    catch (error) {
        if (req.file)
            deleteOldImage(req.file.filename);
        return res.status(500).json({ success: false, message: error.message });
    }
};
exports.createUser = createUser;
const updateUser = async (req, res) => {
    try {
        const admin = req.user;
        const { id } = req.params;
        const { annual_leave_quota, positionId, role, ...rest } = req.body;
        const target = await prisma_1.default.user.findUnique({ where: { id: Number(id) } });
        if (!target)
            return res.status(404).json({ success: false, message: "User tidak ditemukan." });
        // Proteksi agar Admin tidak edit user perusahaan lain
        if (admin.role !== client_1.Role.superadmin && target.companyId !== admin.companyId) {
            return res.status(403).json({ success: false, message: "Akses ditolak." });
        }
        const newQuota = annual_leave_quota ? Number(annual_leave_quota) : target.annual_leave_quota;
        const diff = newQuota - target.annual_leave_quota;
        const updated = await prisma_1.default.user.update({
            where: { id: Number(id) },
            data: {
                ...rest,
                role: admin.role === client_1.Role.superadmin ? role : target.role,
                positionId: positionId ? Number(positionId) : target.positionId,
                annual_leave_quota: newQuota,
                leave_balance: target.leave_balance + diff,
                profile_image: req.file ? req.file.filename : target.profile_image
            }
        });
        if (req.file)
            deleteOldImage(target.profile_image);
        await prisma_1.default.auditLog.create({
            data: {
                companyId: target.companyId, userId: admin.id, actorRole: admin.role,
                action: "UPDATE_USER", details: `Memperbarui data karyawan ID: ${id}`
            }
        });
        return res.json({ success: true, message: "Data berhasil diperbarui", data: updated });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
exports.updateUser = updateUser;
const updateUserStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const { id } = req.params;
        const { companyId, role } = req.user;
        await prisma_1.default.user.update({
            where: { id: Number(id), companyId: role === client_1.Role.superadmin ? undefined : companyId },
            data: { status: status }
        });
        return res.json({ success: true, message: "Status karyawan diperbarui" });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
exports.updateUserStatus = updateUserStatus;
const deleteUser = async (req, res) => {
    try {
        const targetId = Number(req.params.id);
        const { companyId, role, id: adminId } = req.user;
        if (targetId === adminId)
            return res.status(400).json({ success: false, message: "Tidak bisa menghapus akun sendiri." });
        await prisma_1.default.user.update({
            where: { id: targetId, companyId: role === client_1.Role.superadmin ? undefined : companyId },
            data: { status: client_1.UserStatus.Inactive }
        });
        return res.json({ success: true, message: "Karyawan telah dinonaktifkan." });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
exports.deleteUser = deleteUser;
const adminResetPassword = async (req, res) => {
    try {
        const hashedPassword = await bcryptjs_1.default.hash(req.body.newPassword || "123456", 10);
        const { companyId, role } = req.user;
        await prisma_1.default.user.update({
            where: { id: Number(req.params.id), companyId: role === client_1.Role.superadmin ? undefined : companyId },
            data: { password: hashedPassword }
        });
        return res.json({ success: true, message: "Password karyawan berhasil direset" });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
exports.adminResetPassword = adminResetPassword;
const getPositions = async (req, res) => {
    try {
        const data = await prisma_1.default.positionSalary.findMany({
            where: { companyId: req.user.companyId },
            orderBy: { positionName: 'asc' }
        });
        return res.json({ success: true, data });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
exports.getPositions = getPositions;
