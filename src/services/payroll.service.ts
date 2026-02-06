import prisma from "../utils/prisma";
import { AttendanceStatus, PayrollStatus } from "@prisma/client";

export const calculatePayroll = async (
  userId: number,
  month: number,
  year: number
) => {
  // 1. Ambil user + position
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { position: true }
  });

  if (!user || !user.position) {
    throw new Error("Data user atau jabatan tidak ditemukan");
  }

  if (!user.companyId) {
    throw new Error("User tidak terhubung dengan company");
  }

  const master = user.position;
  const companyId = user.companyId;

  // 2. Range tanggal
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);

  // 3. Ambil absensi
  const attendances = await prisma.attendance.findMany({
    where: {
      userId,
      date: { gte: startDate, lte: endDate },
      status: { notIn: [AttendanceStatus.Absent] }
    }
  });

  // 4. Kalkulasi
  let totalWorkHours = 0;
  let totalLateMins = 0;
  const totalAttendance = attendances.length;

  attendances.forEach(att => {
    totalWorkHours += Number(att.workHours || 0);
    totalLateMins += att.lateDuration || 0;
  });

  // 5. Perhitungan gaji
  const baseSalary = Number(master.baseSalary);
  const hourlyRate = Number(master.hourlyRate);
  const lateDeductionRate = Number(master.lateDeductionPerMin);

  const fixedAllowances =
    Number(master.allowance) +
    Number(master.mealAllowance) +
    Number(master.transportAllowance);

  const earningsFromHours = totalWorkHours * hourlyRate;
  const totalDeductions = totalLateMins * lateDeductionRate;

  const netSalary =
    baseSalary + fixedAllowances + earningsFromHours - totalDeductions;

  // 6. UPSERT PAYROLL (FINAL)
  return await prisma.payroll.upsert({
    where: {
      userId_month_year: { userId, month, year }
    },
    update: {
      companyId, // ✅ aman & konsisten
      total_work_hours: totalWorkHours,
      total_late_mins: totalLateMins,
      total_attendance: totalAttendance,
      basic_salary: baseSalary,

      meal_allowance_snapshot: master.mealAllowance,
      transport_allowance_snapshot: master.transportAllowance,
      late_deduction_rate_snapshot: master.lateDeductionPerMin,
      hourly_rate_snapshot: master.hourlyRate,

      allowances: fixedAllowances + earningsFromHours,
      deductions: totalDeductions,
      net_salary: netSalary,
      updated_at: new Date()
    },
    create: {
      userId,
      companyId,
      month,
      year,
      total_work_hours: totalWorkHours,
      total_late_mins: totalLateMins,
      total_attendance: totalAttendance,
      basic_salary: baseSalary,

      meal_allowance_snapshot: master.mealAllowance,
      transport_allowance_snapshot: master.transportAllowance,
      late_deduction_rate_snapshot: master.lateDeductionPerMin,
      hourly_rate_snapshot: master.hourlyRate,

      allowances: fixedAllowances + earningsFromHours,
      deductions: totalDeductions,
      net_salary: netSalary,
      status: PayrollStatus.Draft
    }
  });
};
