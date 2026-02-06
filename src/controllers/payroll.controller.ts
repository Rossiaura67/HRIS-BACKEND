import { Response } from "express";
import { Prisma, PayrollStatus, Role } from "@prisma/client";
import prisma from "../utils/prisma";
import { AuthRequest } from "../middlewares/auth.middleware";
const PDFDocument = require("pdfkit");

const dToN = (val: any): number => (val ? Number(val) : 0);
const roundMoney = (val: number): number => Math.round(val);
const hasBankInfo = (user: any) => user.bank_name && user.bank_account;

/**
 * ==========================================
 * ROLE: EMPLOYEE
 * ==========================================
 */

export const getMyPayrolls = async (req: AuthRequest, res: Response) => {
    try {
        const data = await prisma.payroll.findMany({
            where: { userId: req.user!.id, status: { in: ["Paid", "Approved"] } },
            orderBy: [{ year: 'desc' }, { month: 'desc' }]
        });
        return res.json({ success: true, data });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const getPayrollDetail = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const role = req.user!.role;
        const data = await prisma.payroll.findUnique({
            where: { id: Number(req.params.id) },
            include: { 
                user: { select: { name: true, employeeId: true, bank_name: true, bank_account: true, position: { select: { positionName: true } } } }, 
                company: true,
                attendances: { orderBy: { date: 'asc' } }
            }
        });

        if (!data || (role === Role.employee && data.userId !== userId)) {
            return res.status(403).json({ success: false, message: "Akses ditolak." });
        }

        return res.json({ success: true, data });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * ==========================================
 * ROLE: ADMIN
 * ==========================================
 */

export const generateMonthlyPayroll = async (req: AuthRequest, res: Response) => {
    try {
        const { month, year } = req.body;
        const companyId = req.user!.companyId!;

        if (req.user!.role !== Role.admin) return res.status(403).json({ success: false, message: "Hanya Admin yang dapat memproses gaji." });

        const employees = await prisma.user.findMany({
            where: { companyId, role: Role.employee, status: "Active", positionId: { not: null } },
            include: { position: true }
        });

        const existing = await prisma.payroll.findMany({
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
                basic_salary: emp.position!.baseSalary,
                meal_allowance_snapshot: emp.position!.mealAllowance || 0,
                transport_allowance_snapshot: emp.position!.transportAllowance || 0,
                late_deduction_rate_snapshot: emp.position!.lateDeductionPerMin || 0,
                hourly_rate_snapshot: emp.position!.hourlyRate || 0,
                allowances: emp.position!.allowance || 0,
                net_salary: 0, 
                status: "Draft" as PayrollStatus
            }));

        if (payrollData.length === 0) return res.json({ success: true, message: "Data sudah siap." });

        await prisma.$transaction([
            prisma.payroll.createMany({ data: payrollData }),
            prisma.auditLog.create({
                data: { companyId, userId: req.user!.id, actorRole: Role.admin, action: "GENERATE_PAYROLL", details: `Draft ${month}/${year}` }
            })
        ]);

        return res.status(201).json({ success: true, message: "Draft gaji berhasil dibuat." });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const calculatePayroll = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const companyId = req.user!.companyId!;

        if (req.user!.role !== Role.admin) return res.status(403).json({ success: false });

        const payroll = await prisma.payroll.findUnique({ 
            where: { id: Number(id) },
            include: { user: { select: { join_date: true } } }
        });

        if (!payroll || payroll.companyId !== companyId || payroll.status === "Paid") return res.status(400).json({ success: false });

        const startDate = new Date(payroll.year, payroll.month - 1, 1);
        const endDate = new Date(payroll.year, payroll.month, 0, 23, 59, 59);

        const result = await prisma.$transaction(async (tx) => {
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
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const approveAllMonthly = async (req: AuthRequest, res: Response) => {
    try {
        if (req.user!.role !== Role.admin) return res.status(403).json({ success: false });
        const result = await prisma.payroll.updateMany({
            where: { companyId: req.user!.companyId!, month: Number(req.body.month), year: Number(req.body.year), status: "Review" },
            data: { status: "Approved" }
        });
        return res.json({ success: true, message: `${result.count} data disetujui.` });
    } catch (error: any) {
        return res.status(500).json({ success: false });
    }
};

export const bulkPayment = async (req: AuthRequest, res: Response) => {
    try {
        const { payrollIds } = req.body;
        const companyId = req.user!.companyId!;

        if (req.user!.role !== Role.admin) return res.status(403).json({ success: false });

        const payrolls = await prisma.payroll.findMany({
            where: { id: { in: payrollIds.map(Number) }, companyId },
            include: { user: { select: { bank_name: true, bank_account: true } } }
        });

        if (payrolls.some(p => !hasBankInfo(p.user))) return res.status(400).json({ success: false, message: "Data rekening beberapa karyawan belum lengkap." });

        await prisma.payroll.updateMany({
            where: { id: { in: payrollIds.map(Number) }, companyId, status: "Approved" },
            data: { status: "Paid", paid_at: new Date(), payment_method: "MANUAL" }
        });

        return res.json({ success: true, message: "Pembayaran berhasil." });
    } catch (error: any) {
        return res.status(500).json({ success: false });
    }
};

export const deletePayroll = async (req: AuthRequest, res: Response) => {
    try {
        if (req.user!.role !== Role.admin) return res.status(403).json({ success: false });
        const payroll = await prisma.payroll.findUnique({ where: { id: Number(req.params.id) } });
        if (!payroll || payroll.status === "Paid") return res.status(400).json({ success: false });

        await prisma.$transaction(async (tx) => {
            await tx.attendance.updateMany({ where: { payrollId: Number(req.params.id) }, data: { is_payroll_processed: false, payrollId: null } });
            await tx.payroll.delete({ where: { id: Number(req.params.id), companyId: req.user!.companyId! } });
        });
        return res.json({ success: true, message: "Terhapus." });
    } catch (error: any) {
        return res.status(500).json({ success: false });
    }
};

export const getPayrollStats = async (req: AuthRequest, res: Response) => {
    try {
        if (req.user!.role !== Role.admin) return res.status(403).json({ success: false });
        const summary = await prisma.payroll.aggregate({
            where: { companyId: req.user!.companyId!, status: "Paid" },
            _sum: { net_salary: true },
            _count: { id: true }
        });
        return res.json({ success: true, data: summary });
    } catch (error: any) {
        return res.status(500).json({ success: false });
    }
};

/**
 * ==========================================
 * ROLE: ADMIN & SUPER ADMIN
 * ==========================================
 */

export const getAllPayrolls = async (req: AuthRequest, res: Response) => {
    try {
        const { month, year, status } = req.query;
        const data = await prisma.payroll.findMany({
            where: { 
                companyId: req.user!.role === Role.superadmin ? undefined : req.user!.companyId!,
                month: month ? Number(month) : undefined,
                year: year ? Number(year) : undefined,
                status: status as PayrollStatus
            },
            include: { user: { select: { name: true, employeeId: true, bank_name: true, bank_account: true, position: { select: { positionName: true } } } } },
            orderBy: { id: 'desc' }
        });
        return res.json({ success: true, data });
    } catch (error: any) {
        return res.status(500).json({ success: false });
    }
};

export const exportPayrollToPDF = async (req: AuthRequest, res: Response) => {
    try {
        const { month, year } = req.query;
        const companyId = req.user!.companyId!;

        const payrolls = await prisma.payroll.findMany({
            where: { companyId, month: Number(month), year: Number(year) },
            include: { 
                user: { select: { name: true, employeeId: true, bank_name: true, bank_account: true, position: { select: { positionName: true } } } },
                company: { select: { name: true } }
            }
        });

        if (payrolls.length === 0) return res.status(404).json({ success: false });

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
            if (rowY > 500) { doc.addPage({ layout: 'landscape' }); rowY = 50; }
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
    } catch (error: any) {
        return res.status(500).json({ success: false });
    }
};

/**
 * ==========================================
 * ROLE: SUPER ADMIN
 * ==========================================
 */

export const getGlobalPayrollLogs = async (req: AuthRequest, res: Response) => {
    try {
        if (req.user!.role !== Role.superadmin) return res.status(403).json({ success: false });
        const data = await prisma.payroll.findMany({
            include: { company: { select: { name: true } }, user: { select: { name: true } } },
            orderBy: { id: 'desc' },
            take: 100
        });
        return res.json({ success: true, data });
    } catch (error: any) {
        return res.status(500).json({ success: false });
    }
};