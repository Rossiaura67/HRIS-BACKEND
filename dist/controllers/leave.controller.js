"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSystemWideLeaves = exports.getLeaveStats = exports.getActiveLeavesToday = exports.reviewLeave = exports.cancelLeave = exports.requestLeave = exports.getLeaveQuota = exports.getLeaveDetail = exports.getLeaves = void 0;
const prisma_1 = __importDefault(require("../utils/prisma"));
const client_1 = require("@prisma/client");
/**
 * HELPER: Menghitung hari kerja (Senin-Jumat)
 */
const calculateActualWorkDays = async (start, end, companyId) => {
    const holidays = await prisma_1.default.holiday.findMany({
        where: {
            companyId,
            date: { gte: start, lte: end }
        }
    });
    const holidayDates = holidays.map(h => h.date.toISOString().split('T')[0]);
    let count = 0;
    const curDate = new Date(start.getTime());
    while (curDate <= end) {
        const dayOfWeek = curDate.getDay();
        const dateStr = curDate.toISOString().split('T')[0];
        if (dayOfWeek !== 0 && dayOfWeek !== 6 && !holidayDates.includes(dateStr)) {
            count++;
        }
        curDate.setDate(curDate.getDate() + 1);
    }
    return count;
};
/**
 * 1. GET LEAVES (Multi-role)
 */
const getLeaves = async (req, res) => {
    try {
        const user = req.user;
        const { status, type } = req.query;
        const whereClause = {};
        if (user.role === client_1.Role.employee) {
            whereClause.userId = user.id;
        }
        else {
            whereClause.companyId = user.companyId;
        }
        if (status)
            whereClause.status = status;
        if (type)
            whereClause.type = type;
        const data = await prisma_1.default.leave.findMany({
            where: whereClause,
            include: {
                user: { select: { name: true, employeeId: true, profile_image: true } }
            },
            orderBy: { created_at: 'desc' }
        });
        return res.json({ success: true, data });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: "Gagal memuat data cuti" });
    }
};
exports.getLeaves = getLeaves;
/**
 * 2. GET LEAVE DETAIL
 */
const getLeaveDetail = async (req, res) => {
    try {
        const { id } = req.params;
        const user = req.user;
        const data = await prisma_1.default.leave.findUnique({
            where: { id: Number(id) },
            include: { user: { select: { name: true, employeeId: true, position: true } } }
        });
        if (!data)
            return res.status(404).json({ success: false, message: "Data tidak ditemukan" });
        if (user.role !== client_1.Role.superadmin && data.companyId !== user.companyId) {
            return res.status(403).json({ success: false, message: "Akses ditolak" });
        }
        return res.json({ success: true, data });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: "Terjadi kesalahan sistem" });
    }
};
exports.getLeaveDetail = getLeaveDetail;
/**
 * 3. GET MY QUOTA
 */
const getLeaveQuota = async (req, res) => {
    const data = await prisma_1.default.user.findUnique({
        where: { id: req.user.id },
        select: { annual_leave_quota: true, leave_balance: true }
    });
    return res.json({ success: true, data });
};
exports.getLeaveQuota = getLeaveQuota;
/**
 * 4. REQUEST LEAVE (Employee)
 * Sinkron: Kirim Notifikasi ke Seluruh Admin Perusahaan
 */
const requestLeave = async (req, res) => {
    try {
        const user = req.user;
        const { type, startDate, endDate, reason } = req.body;
        const sub = await prisma_1.default.subscription.findUnique({ where: { companyId: user.companyId } });
        if (!sub || sub.status === "Expired" || new Date(sub.endDate) < new Date()) {
            return res.status(403).json({ success: false, message: "Masa langganan berakhir." });
        }
        const start = new Date(startDate);
        const end = new Date(endDate);
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        const daysTaken = await calculateActualWorkDays(start, end, user.companyId);
        if (daysTaken <= 0)
            return res.status(400).json({ success: false, message: "Hanya bisa mengajukan pada hari kerja." });
        const castedType = type;
        if (castedType === client_1.LeaveType.Annual) {
            const userData = await prisma_1.default.user.findUnique({ where: { id: user.id } });
            if ((userData?.leave_balance || 0) < daysTaken) {
                return res.status(400).json({ success: false, message: "Sisa kuota cuti tidak mencukupi." });
            }
        }
        const newLeave = await prisma_1.default.leave.create({
            data: {
                userId: user.id,
                companyId: user.companyId,
                type: castedType,
                startDate: start,
                endDate: end,
                days_taken: daysTaken,
                reason,
                evidence: req.file ? req.file.filename : null,
                status: client_1.LeaveStatus.Pending
            }
        });
        // --- NOTIFIKASI KE ADMIN ---
        const admins = await prisma_1.default.user.findMany({
            where: { companyId: user.companyId, role: client_1.Role.admin },
            select: { id: true }
        });
        if (admins.length > 0) {
            await prisma_1.default.notification.createMany({
                data: admins.map(adm => ({
                    userId: adm.id,
                    title: "Pengajuan Cuti Baru",
                    message: `Karyawan ${user.name} mengajukan cuti ${castedType} selama ${daysTaken} hari.`
                }))
            });
        }
        return res.status(201).json({ success: true, message: "Pengajuan berhasil dikirim", data: newLeave });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
exports.requestLeave = requestLeave;
/**
 * 5. CANCEL LEAVE
 */
const cancelLeave = async (req, res) => {
    try {
        const { id } = req.params;
        const leave = await prisma_1.default.leave.findFirst({
            where: { id: Number(id), userId: req.user.id, status: client_1.LeaveStatus.Pending }
        });
        if (!leave)
            return res.status(404).json({ success: false, message: "Pengajuan tidak ditemukan" });
        await prisma_1.default.leave.delete({ where: { id: Number(id) } });
        return res.json({ success: true, message: "Pengajuan berhasil dibatalkan" });
    }
    catch (error) {
        return res.status(500).json({ success: false });
    }
};
exports.cancelLeave = cancelLeave;
/**
 * 6. REVIEW LEAVE (Admin)
 * Sinkron: Potong Saldo, Generate Absensi, & Kirim Notifikasi ke Karyawan
 */
const reviewLeave = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, rejected_reason } = req.body;
        const admin = req.user;
        const leave = await prisma_1.default.leave.findUnique({ where: { id: Number(id) } });
        if (!leave || leave.companyId !== admin.companyId) {
            return res.status(404).json({ success: false, message: "Data tidak ditemukan." });
        }
        if (leave.status !== client_1.LeaveStatus.Pending) {
            return res.status(400).json({ success: false, message: "Pengajuan sudah diproses." });
        }
        await prisma_1.default.$transaction(async (tx) => {
            // 1. Update Status Leave
            await tx.leave.update({
                where: { id: Number(id) },
                data: {
                    status: status,
                    rejected_reason: typeof rejected_reason === 'string' ? rejected_reason : null
                }
            });
            // 2. Logika jika disetujui
            if (status === client_1.LeaveStatus.Approved) {
                if (leave.type === client_1.LeaveType.Annual) {
                    await tx.user.update({
                        where: { id: leave.userId },
                        data: { leave_balance: { decrement: leave.days_taken } }
                    });
                }
                // Generate Attendance
                let current = new Date(leave.startDate);
                while (current <= leave.endDate) {
                    if (current.getDay() !== 0 && current.getDay() !== 6) {
                        const dateOnly = new Date(current.toISOString().split('T')[0] + "T00:00:00.000Z");
                        await tx.attendance.upsert({
                            where: { userId_date: { userId: leave.userId, date: dateOnly } },
                            update: {
                                status: leave.type === client_1.LeaveType.Sick ? client_1.AttendanceStatus.Sick : client_1.AttendanceStatus.AnnualLeave,
                                leaveId: leave.id,
                                tipeAbsensi: "Cuti (System)"
                            },
                            create: {
                                userId: leave.userId,
                                date: dateOnly,
                                status: leave.type === client_1.LeaveType.Sick ? client_1.AttendanceStatus.Sick : client_1.AttendanceStatus.AnnualLeave,
                                leaveId: leave.id,
                                tipeAbsensi: "Cuti (System)"
                            }
                        });
                    }
                    current.setDate(current.getDate() + 1);
                }
            }
            // 3. KIRIM NOTIFIKASI KE KARYAWAN (Targeted)
            await tx.notification.create({
                data: {
                    userId: leave.userId,
                    title: status === client_1.LeaveStatus.Approved ? "Cuti Disetujui" : "Cuti Ditolak",
                    message: status === client_1.LeaveStatus.Approved
                        ? `Selamat, pengajuan cuti ${leave.type} Anda telah disetujui oleh Admin.`
                        : `Mohon maaf, pengajuan cuti Anda ditolak. Alasan: ${rejected_reason || '-'}`
                }
            });
        });
        return res.json({ success: true, message: `Berhasil memperbarui status menjadi ${status}` });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
exports.reviewLeave = reviewLeave;
/**
 * 7. GET ACTIVE LEAVES TODAY (Admin)
 */
const getActiveLeavesToday = async (req, res) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const data = await prisma_1.default.leave.findMany({
        where: {
            companyId: req.user.companyId,
            status: client_1.LeaveStatus.Approved,
            startDate: { lte: today },
            endDate: { gte: today }
        },
        include: { user: { select: { name: true, employeeId: true } } }
    });
    return res.json({ success: true, data });
};
exports.getActiveLeavesToday = getActiveLeavesToday;
/**
 * 8. GET LEAVE STATS (Admin)
 */
const getLeaveStats = async (req, res) => {
    try {
        const companyId = req.user.companyId;
        const pending = await prisma_1.default.leave.count({ where: { companyId, status: client_1.LeaveStatus.Pending } });
        const approved = await prisma_1.default.leave.count({ where: { companyId, status: client_1.LeaveStatus.Approved } });
        return res.json({ success: true, data: { pending, approved } });
    }
    catch (error) {
        return res.status(500).json({ success: false });
    }
};
exports.getLeaveStats = getLeaveStats;
/**
 * 9. GET SYSTEM WIDE LEAVES (Superadmin)
 */
const getSystemWideLeaves = async (req, res) => {
    try {
        const data = await prisma_1.default.leave.findMany({
            include: {
                user: { select: { name: true, company: { select: { name: true } } } }
            },
            orderBy: { created_at: 'desc' },
            take: 100
        });
        return res.json({ success: true, data });
    }
    catch (error) {
        return res.status(500).json({ success: false });
    }
};
exports.getSystemWideLeaves = getSystemWideLeaves;
