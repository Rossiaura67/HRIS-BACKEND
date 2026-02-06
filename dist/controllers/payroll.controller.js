"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGlobalPayrollLogs = exports.exportPayrollToPDF = exports.getAllPayrolls = exports.getPayrollStats = exports.deletePayroll = exports.bulkPayment = exports.approveAllMonthly = exports.calculatePayroll = exports.generateMonthlyPayroll = exports.getPayrollDetail = exports.getMyPayrolls = void 0;
const client_1 = require("@prisma/client");
const prisma_1 = __importDefault(require("../utils/prisma"));
const PDFDocument = require("pdfkit");
const dToN = (val) => (val ? Number(val) : 0);
const roundMoney = (val) => Math.round(val);
const hasBankInfo = (user) => user.bank_name && user.bank_account;
/**
 * ==========================================
 * ROLE: EMPLOYEE
 * ==========================================
 */
const getMyPayrolls = async (req, res) => {
    try {
        const data = await prisma_1.default.payroll.findMany({
            where: { userId: req.user.id, status: { in: ["Paid", "Approved"] } },
            orderBy: [{ year: 'desc' }, { month: 'desc' }]
        });
        return res.json({ success: true, data });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
exports.getMyPayrolls = getMyPayrolls;
const getPayrollDetail = async (req, res) => {
    try {
        const userId = req.user.id;
        const role = req.user.role;
        const data = await prisma_1.default.payroll.findUnique({
            where: { id: Number(req.params.id) },
            include: {
                user: { select: { name: true, employeeId: true, bank_name: true, bank_account: true, position: { select: { positionName: true } } } },
                company: true,
                attendances: { orderBy: { date: 'asc' } }
            }
        });
        if (!data || (role === client_1.Role.employee && data.userId !== userId)) {
            return res.status(403).json({ success: false, message: "Akses ditolak." });
        }
        return res.json({ success: true, data });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
exports.getPayrollDetail = getPayrollDetail;
/**
 * ==========================================
 * ROLE: ADMIN
 * ==========================================
 */
const generateMonthlyPayroll = async (req, res) => {
    try {
        const { month, year } = req.body;
        const companyId = req.user.companyId;
        if (req.user.role !== client_1.Role.admin)
            return res.status(403).json({ success: false, message: "Hanya Admin yang dapat memproses gaji." });
        const employees = await prisma_1.default.user.findMany({
            where: { companyId, role: client_1.Role.employee, status: "Active", positionId: { not: null } },
            include: { position: true }
        });
        const existing = await prisma_1.default.payroll.findMany({
            where: { companyId, month: Number(month), year: Number(year) },
            select: { userId: true }
        });
        const existingIds = new Set(existing.map(p => p.userId));
        const payrollData = employees
            .filter(emp => !existingIds.has(emp.id))
            .map(emp => ({
            userId: emp.id,
            companyId,
            month: Number(month),
            year: Number(year),
            basic_salary: emp.position.baseSalary,
            meal_allowance_snapshot: emp.position.mealAllowance || 0,
            transport_allowance_snapshot: emp.position.transportAllowance || 0,
            late_deduction_rate_snapshot: emp.position.lateDeductionPerMin || 0,
            hourly_rate_snapshot: emp.position.hourlyRate || 0,
            allowances: emp.position.allowance || 0,
            net_salary: 0,
            status: "Draft"
        }));
        if (payrollData.length === 0)
            return res.json({ success: true, message: "Data sudah siap." });
        await prisma_1.default.$transaction([
            prisma_1.default.payroll.createMany({ data: payrollData }),
            prisma_1.default.auditLog.create({
                data: { companyId, userId: req.user.id, actorRole: client_1.Role.admin, action: "GENERATE_PAYROLL", details: `Draft ${month}/${year}` }
            })
        ]);
        return res.status(201).json({ success: true, message: "Draft gaji berhasil dibuat." });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
exports.generateMonthlyPayroll = generateMonthlyPayroll;
const calculatePayroll = async (req, res) => {
    try {
        const { id } = req.params;
        const companyId = req.user.companyId;
        if (req.user.role !== client_1.Role.admin)
            return res.status(403).json({ success: false });
        const payroll = await prisma_1.default.payroll.findUnique({
            where: { id: Number(id) },
            include: { user: { select: { join_date: true } } }
        });
        if (!payroll || payroll.companyId !== companyId || payroll.status === "Paid")
            return res.status(400).json({ success: false });
        const startDate = new Date(payroll.year, payroll.month - 1, 1);
        const endDate = new Date(payroll.year, payroll.month, 0, 23, 59, 59);
        const result = await prisma_1.default.$transaction(async (tx) => {
            const attendances = await tx.attendance.findMany({
                where: { userId: payroll.userId, date: { gte: startDate, lte: endDate }, status: { in: ["OnTime", "Late", "AnnualLeave", "Sick"] } }
            });
            const totalAttendance = attendances.length;
            const totalLateMins = attendances.reduce((acc, curr) => acc + (curr.lateDuration || 0), 0);
            let baseSalary = dToN(payroll.basic_salary);
            const joinDate = payroll.user.join_date ? new Date(payroll.user.join_date) : null;
            if (joinDate && joinDate > startDate && joinDate <= endDate) {
                const totalDays = new Date(payroll.year, payroll.month, 0).getDate();
                const activeDays = (endDate.getDate() - joinDate.getDate()) + 1;
                baseSalary = (activeDays / totalDays) * baseSalary;
            }
            const dailyBenefits = (dToN(payroll.meal_allowance_snapshot) + dToN(payroll.transport_allowance_snapshot)) * totalAttendance;
            const lateDeduction = totalLateMins * dToN(payroll.late_deduction_rate_snapshot);
            const netSalary = roundMoney((baseSalary + dToN(payroll.allowances) + dailyBenefits) - lateDeduction);
            await tx.attendance.updateMany({
                where: { userId: payroll.userId, date: { gte: startDate, lte: endDate } },
                data: { is_payroll_processed: true, payrollId: payroll.id }
            });
            return await tx.payroll.update({
                where: { id: payroll.id },
                data: { total_attendance: totalAttendance, total_late_mins: totalLateMins, deductions: lateDeduction, net_salary: netSalary, status: "Review" }
            });
        });
        return res.json({ success: true, data: result });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
exports.calculatePayroll = calculatePayroll;
const approveAllMonthly = async (req, res) => {
    try {
        if (req.user.role !== client_1.Role.admin)
            return res.status(403).json({ success: false });
        const result = await prisma_1.default.payroll.updateMany({
            where: { companyId: req.user.companyId, month: Number(req.body.month), year: Number(req.body.year), status: "Review" },
            data: { status: "Approved" }
        });
        return res.json({ success: true, message: `${result.count} data disetujui.` });
    }
    catch (error) {
        return res.status(500).json({ success: false });
    }
};
exports.approveAllMonthly = approveAllMonthly;
const bulkPayment = async (req, res) => {
    try {
        const { payrollIds } = req.body;
        const companyId = req.user.companyId;
        if (req.user.role !== client_1.Role.admin)
            return res.status(403).json({ success: false });
        const payrolls = await prisma_1.default.payroll.findMany({
            where: { id: { in: payrollIds.map(Number) }, companyId },
            include: { user: { select: { bank_name: true, bank_account: true } } }
        });
        if (payrolls.some(p => !hasBankInfo(p.user)))
            return res.status(400).json({ success: false, message: "Data rekening beberapa karyawan belum lengkap." });
        await prisma_1.default.payroll.updateMany({
            where: { id: { in: payrollIds.map(Number) }, companyId, status: "Approved" },
            data: { status: "Paid", paid_at: new Date(), payment_method: "MANUAL" }
        });
        return res.json({ success: true, message: "Pembayaran berhasil." });
    }
    catch (error) {
        return res.status(500).json({ success: false });
    }
};
exports.bulkPayment = bulkPayment;
const deletePayroll = async (req, res) => {
    try {
        if (req.user.role !== client_1.Role.admin)
            return res.status(403).json({ success: false });
        const payroll = await prisma_1.default.payroll.findUnique({ where: { id: Number(req.params.id) } });
        if (!payroll || payroll.status === "Paid")
            return res.status(400).json({ success: false });
        await prisma_1.default.$transaction(async (tx) => {
            await tx.attendance.updateMany({ where: { payrollId: Number(req.params.id) }, data: { is_payroll_processed: false, payrollId: null } });
            await tx.payroll.delete({ where: { id: Number(req.params.id), companyId: req.user.companyId } });
        });
        return res.json({ success: true, message: "Terhapus." });
    }
    catch (error) {
        return res.status(500).json({ success: false });
    }
};
exports.deletePayroll = deletePayroll;
const getPayrollStats = async (req, res) => {
    try {
        if (req.user.role !== client_1.Role.admin)
            return res.status(403).json({ success: false });
        const summary = await prisma_1.default.payroll.aggregate({
            where: { companyId: req.user.companyId, status: "Paid" },
            _sum: { net_salary: true },
            _count: { id: true }
        });
        return res.json({ success: true, data: summary });
    }
    catch (error) {
        return res.status(500).json({ success: false });
    }
};
exports.getPayrollStats = getPayrollStats;
/**
 * ==========================================
 * ROLE: ADMIN & SUPER ADMIN
 * ==========================================
 */
const getAllPayrolls = async (req, res) => {
    try {
        const { month, year, status } = req.query;
        const data = await prisma_1.default.payroll.findMany({
            where: {
                companyId: req.user.role === client_1.Role.superadmin ? undefined : req.user.companyId,
                month: month ? Number(month) : undefined,
                year: year ? Number(year) : undefined,
                status: status
            },
            include: { user: { select: { name: true, employeeId: true, bank_name: true, bank_account: true, position: { select: { positionName: true } } } } },
            orderBy: { id: 'desc' }
        });
        return res.json({ success: true, data });
    }
    catch (error) {
        return res.status(500).json({ success: false });
    }
};
exports.getAllPayrolls = getAllPayrolls;
const exportPayrollToPDF = async (req, res) => {
    try {
        const { month, year } = req.query;
        const companyId = req.user.companyId;
        const payrolls = await prisma_1.default.payroll.findMany({
            where: { companyId, month: Number(month), year: Number(year) },
            include: {
                user: { select: { name: true, employeeId: true, bank_name: true, bank_account: true, position: { select: { positionName: true } } } },
                company: { select: { name: true } }
            }
        });
        if (payrolls.length === 0)
            return res.status(404).json({ success: false });
        const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
        res.setHeader('Content-disposition', `attachment; filename=Rekap_Gaji.pdf`);
        res.setHeader('Content-type', 'application/pdf');
        doc.pipe(res);
        doc.fontSize(16).text(payrolls[0].company.name.toUpperCase(), { align: 'center' });
        doc.fontSize(10).text(`LAPORAN GAJI PERIODE ${month} / ${year}`, { align: 'center' });
        doc.moveDown(2);
        const tableTop = 120;
        const cols = [30, 80, 200, 320, 450, 550, 650];
        doc.fontSize(9).font('Helvetica-Bold');
        ["ID", "Nama", "Jabatan", "Rekening", "Gaji Pokok", "Potongan", "Total"].forEach((h, i) => doc.text(h, cols[i], tableTop));
        doc.moveTo(30, tableTop + 15).lineTo(780, tableTop + 15).stroke();
        let rowY = tableTop + 25;
        doc.font('Helvetica');
        payrolls.forEach((p) => {
            if (rowY > 500) {
                doc.addPage({ layout: 'landscape' });
                rowY = 50;
            }
            doc.text(p.user.employeeId || "-", cols[0], rowY);
            doc.text(p.user.name, cols[1], rowY, { width: 110 });
            doc.text(p.user.position?.positionName || "-", cols[2], rowY, { width: 110 });
            doc.text(`${p.user.bank_name || '-'}\n${p.user.bank_account || '-'}`, cols[3], rowY, { width: 120 });
            doc.text(Number(p.basic_salary).toLocaleString('id-ID'), cols[4], rowY);
            doc.text(Number(p.deductions).toLocaleString('id-ID'), cols[5], rowY);
            doc.text(Number(p.net_salary).toLocaleString('id-ID'), cols[6], rowY);
            rowY += 40;
            doc.moveTo(30, rowY - 5).lineTo(780, rowY - 5).strokeColor('#eeeeee').stroke();
        });
        doc.end();
    }
    catch (error) {
        return res.status(500).json({ success: false });
    }
};
exports.exportPayrollToPDF = exportPayrollToPDF;
/**
 * ==========================================
 * ROLE: SUPER ADMIN
 * ==========================================
 */
const getGlobalPayrollLogs = async (req, res) => {
    try {
        if (req.user.role !== client_1.Role.superadmin)
            return res.status(403).json({ success: false });
        const data = await prisma_1.default.payroll.findMany({
            include: { company: { select: { name: true } }, user: { select: { name: true } } },
            orderBy: { id: 'desc' },
            take: 100
        });
        return res.json({ success: true, data });
    }
    catch (error) {
        return res.status(500).json({ success: false });
    }
};
exports.getGlobalPayrollLogs = getGlobalPayrollLogs;
