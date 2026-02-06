"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAttendanceReport = exports.bulkUpdateAttendance = exports.updateAttendanceManual = exports.getAttendanceByUser = exports.getAllAttendance = exports.getMyAttendance = exports.getTodayAttendance = exports.addCheckClock = void 0;
const client_1 = require("@prisma/client");
const prisma_1 = __importDefault(require("../utils/prisma"));
const PDFDocument = require("pdfkit");
/**
 * ==========================================
 * HELPERS
 * ==========================================
 */
const getDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};
const getTodayDate = () => {
    const now = new Date();
    const jakartaDate = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(now);
    return new Date(jakartaDate + "T00:00:00.000Z");
};
/**
 * ==========================================
 * ROLE: EMPLOYEE (SELF-SERVICE)
 * ==========================================
 */
const addCheckClock = async (req, res) => {
    try {
        const user = req.user;
        const { tipeAbsensi, latitude, longitude, deviceName, addressDetail } = req.body;
        if (!latitude || !longitude)
            return res.status(400).json({ success: false, message: "Akses lokasi diperlukan." });
        const today = getTodayDate();
        const now = new Date();
        // 1. Geofencing Check
        const office = await prisma_1.default.officeSetting.findFirst({ where: { companyId: user.companyId } });
        if (office) {
            const distance = getDistance(Number(latitude), Number(longitude), Number(office.latitude), Number(office.longitude));
            if (distance > office.radius) {
                return res.status(400).json({ success: false, message: `Di luar radius kantor (${Math.round(distance)}m).` });
            }
        }
        const record = await prisma_1.default.attendance.findUnique({
            where: { userId_date: { userId: user.id, date: today } }
        });
        // 2. Payroll Process Guard
        if (record?.is_payroll_processed)
            return res.status(403).json({ success: false, message: "Absensi sudah dikunci oleh sistem Payroll." });
        // --- LOGIKA CLOCK IN ---
        if (tipeAbsensi === "Masuk") {
            if (record?.clockIn)
                return res.status(400).json({ success: false, message: "Anda sudah absen masuk." });
            const [isHoliday, setting] = await Promise.all([
                prisma_1.default.holiday.findUnique({ where: { companyId_date: { companyId: user.companyId, date: today } } }),
                prisma_1.default.attendanceSetting.findUnique({ where: { companyId_name: { companyId: user.companyId, name: "clockInTime" } } })
            ]);
            if (isHoliday || now.getDay() === 0 || now.getDay() === 6) {
                return res.status(400).json({ success: false, message: "Absen masuk tidak diizinkan pada hari libur/weekend." });
            }
            const [h, m] = (setting?.value || "08:00").split(":").map(Number);
            const schedule = new Date(today);
            schedule.setHours(h, m, 0, 0);
            const isLate = now.getTime() > schedule.getTime();
            const lateDuration = isLate ? Math.floor((now.getTime() - schedule.getTime()) / 60000) : 0;
            const newRecord = await prisma_1.default.attendance.upsert({
                where: { userId_date: { userId: user.id, date: today } },
                update: {
                    clockIn: now, latIn: new client_1.Prisma.Decimal(latitude), longIn: new client_1.Prisma.Decimal(longitude),
                    status: (isLate ? "Late" : "OnTime"), isLate, lateDuration, tipeAbsensi: "Hadir", clockInDevice: deviceName
                },
                create: {
                    userId: user.id, date: today, clockIn: now, latIn: new client_1.Prisma.Decimal(latitude),
                    longIn: new client_1.Prisma.Decimal(longitude), status: (isLate ? "Late" : "OnTime"),
                    isLate, lateDuration, tipeAbsensi: "Hadir", clockInDevice: deviceName, detailAlamat: addressDetail
                }
            });
            await prisma_1.default.notification.create({
                data: {
                    userId: user.id,
                    title: isLate ? "Peringatan Terlambat" : "Absensi Berhasil",
                    message: isLate ? `Anda terlambat ${lateDuration} menit.` : `Presensi masuk berhasil.`
                }
            });
            return res.json({ success: true, data: newRecord });
        }
        // --- LOGIKA CLOCK OUT ---
        if (tipeAbsensi === "Pulang") {
            if (!record?.clockIn)
                return res.status(400).json({ success: false, message: "Harap lakukan absen masuk terlebih dahulu." });
            if (record.clockOut)
                return res.status(400).json({ success: false, message: "Anda sudah melakukan absen pulang." });
            const workHours = parseFloat(((now.getTime() - new Date(record.clockIn).getTime()) / 3600000).toFixed(2));
            const updated = await prisma_1.default.attendance.update({
                where: { id: record.id },
                data: {
                    clockOut: now, workHours,
                    latOut: new client_1.Prisma.Decimal(latitude), longOut: new client_1.Prisma.Decimal(longitude),
                    clockOutDevice: deviceName
                }
            });
            return res.json({ success: true, data: updated });
        }
        return res.status(400).json({ success: false, message: "Perintah absensi tidak dikenali." });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
exports.addCheckClock = addCheckClock;
const getTodayAttendance = async (req, res) => {
    try {
        const data = await prisma_1.default.attendance.findUnique({
            where: { userId_date: { userId: req.user.id, date: getTodayDate() } }
        });
        return res.json({ success: true, data });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
exports.getTodayAttendance = getTodayAttendance;
const getMyAttendance = async (req, res) => {
    try {
        const data = await prisma_1.default.attendance.findMany({
            where: { userId: req.user.id },
            orderBy: { date: 'desc' },
            take: 31
        });
        return res.json({ success: true, data });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
exports.getMyAttendance = getMyAttendance;
/**
 * ==========================================
 * ROLE: ADMIN (MANAGEMENT)
 * ==========================================
 */
const getAllAttendance = async (req, res) => {
    try {
        const { date, search } = req.query;
        const companyId = req.user.companyId;
        const targetDate = date ? new Date(date) : getTodayDate();
        const data = await prisma_1.default.attendance.findMany({
            where: {
                date: targetDate,
                user: {
                    companyId: companyId,
                    name: { contains: search ? String(search) : undefined }
                }
            },
            include: {
                user: {
                    select: {
                        name: true, employeeId: true,
                        position: { select: { positionName: true } }
                    }
                }
            },
            orderBy: { clockIn: 'desc' }
        });
        return res.json({ success: true, data });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: "Server Error" });
    }
};
exports.getAllAttendance = getAllAttendance;
const getAttendanceByUser = async (req, res) => {
    try {
        const { userId } = req.params;
        const companyId = req.user.companyId;
        const data = await prisma_1.default.attendance.findMany({
            where: {
                userId: Number(userId),
                user: { companyId: companyId }
            },
            include: {
                user: { select: { name: true, employeeId: true } }
            },
            orderBy: { date: 'desc' },
            take: 31
        });
        return res.json({ success: true, data });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
exports.getAttendanceByUser = getAttendanceByUser;
const updateAttendanceManual = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, reason } = req.body;
        const companyId = req.user.companyId;
        const check = await prisma_1.default.attendance.findFirst({
            where: { id: Number(id), user: { companyId } }
        });
        if (!check || check.is_payroll_processed) {
            return res.status(403).json({ success: false, message: "Data tidak ditemukan atau sudah terkunci payroll." });
        }
        // Logic: Jika admin set manual ke OnTime/Permit/AnnualLeave, hapus durasi telat.
        const shouldResetLate = ["OnTime", "AnnualLeave", "Permit", "Sick"].includes(status);
        const result = await prisma_1.default.$transaction(async (tx) => {
            const updated = await tx.attendance.update({
                where: { id: Number(id) },
                data: {
                    status: status,
                    isLate: shouldResetLate ? false : check.isLate,
                    lateDuration: shouldResetLate ? 0 : check.lateDuration
                }
            });
            await tx.auditLog.create({
                data: {
                    userId: req.user.id,
                    companyId,
                    actorRole: req.user.role,
                    action: "EDIT_ATTENDANCE",
                    details: `Ubah status ID ${id} ke ${status}. Alasan: ${reason}`
                }
            });
            return updated;
        });
        return res.json({ success: true, data: result });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
exports.updateAttendanceManual = updateAttendanceManual;
const bulkUpdateAttendance = async (req, res) => {
    try {
        const { userIds, date, status } = req.body;
        const companyId = req.user.companyId;
        const targetDate = new Date(date);
        targetDate.setHours(0, 0, 0, 0);
        const operations = userIds.map((uId) => prisma_1.default.attendance.upsert({
            where: { userId_date: { userId: uId, date: targetDate } },
            update: { status: status, lateDuration: 0, isLate: false },
            create: { userId: uId, date: targetDate, status: status, tipeAbsensi: "Manual Bulk" }
        }));
        await prisma_1.default.$transaction([
            ...operations,
            prisma_1.default.auditLog.create({
                data: {
                    userId: req.user.id,
                    companyId,
                    actorRole: req.user.role,
                    action: "BULK_EDIT_ATTENDANCE",
                    details: `Pembaruan massal ${userIds.length} user ke status ${status}`
                }
            })
        ]);
        return res.json({ success: true, message: "Pembaruan massal berhasil." });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: "Gagal memproses pembaruan massal." });
    }
};
exports.bulkUpdateAttendance = bulkUpdateAttendance;
const getAttendanceReport = async (req, res) => {
    try {
        const { date } = req.query;
        const companyId = req.user.companyId;
        const targetDate = date ? new Date(date) : getTodayDate();
        const attendances = await prisma_1.default.attendance.findMany({
            where: { date: targetDate, user: { companyId } },
            include: {
                user: {
                    select: {
                        name: true, employeeId: true,
                        position: { select: { positionName: true } }
                    }
                }
            },
            orderBy: { user: { name: 'asc' } }
        });
        if (attendances.length === 0)
            return res.status(404).json({ success: false, message: "Data kosong." });
        const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Report_${targetDate.toISOString().split('T')[0]}.pdf`);
        doc.pipe(res);
        doc.fontSize(16).font("Helvetica-Bold").text("LAPORAN DETAIL PRESENSI KARYAWAN", { align: "center" });
        doc.fontSize(10).font("Helvetica").text(`Tanggal: ${targetDate.toLocaleDateString('id-ID', { dateStyle: 'full' })}`, { align: "center" });
        doc.moveDown(2);
        const tableTop = 120;
        const cols = [40, 160, 260, 330, 400, 470, 540];
        doc.fontSize(9).font("Helvetica-Bold");
        doc.text("NAMA KARYAWAN", cols[0], tableTop);
        doc.text("JABATAN", cols[1], tableTop);
        doc.text("MASUK", cols[2], tableTop);
        doc.text("KELUAR", cols[3], tableTop);
        doc.text("DURASI", cols[4], tableTop);
        doc.text("STATUS", cols[5], tableTop);
        doc.text("ALAMAT/DETAIL", cols[6], tableTop);
        doc.moveTo(cols[0], tableTop + 15).lineTo(780, tableTop + 15).stroke();
        let y = tableTop + 25;
        doc.font("Helvetica").fontSize(8);
        attendances.forEach((att) => {
            if (y > 500) {
                doc.addPage({ layout: 'landscape', margin: 30 });
                y = 50;
            }
            const clockIn = att.clockIn ? new Date(att.clockIn).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : "--:--";
            const clockOut = att.clockOut ? new Date(att.clockOut).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : "--:--";
            doc.text(att.user.name.toUpperCase(), cols[0], y, { width: 110 });
            doc.text(att.user.position?.positionName || "Staff", cols[1], y, { width: 90 });
            doc.text(clockIn, cols[2], y);
            doc.text(clockOut, cols[3], y);
            doc.text(att.workHours ? `${att.workHours} Jam` : "-", cols[4], y);
            doc.text(att.status, cols[5], y);
            doc.text(att.detailAlamat || "Radius Kantor", cols[6], y, { width: 240 });
            doc.moveTo(cols[0], y + 15).lineTo(780, y + 15).lineWidth(0.5).opacity(0.3).stroke().opacity(1);
            y += 25;
        });
        doc.end();
    }
    catch (error) {
        if (!res.headersSent)
            res.status(500).json({ success: false, message: error.message });
    }
};
exports.getAttendanceReport = getAttendanceReport;
