"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDashboard = void 0;
const prisma_1 = __importDefault(require("../utils/prisma"));
const client_1 = require("@prisma/client");
const getDashboard = async (req, res) => {
    try {
        const user = req.user;
        // 1. Inisialisasi Filter Waktu (Bulan Ini)
        const month = parseInt(req.query.month) || new Date().getMonth() + 1;
        const year = parseInt(req.query.year) || new Date().getFullYear();
        const startOfMonth = new Date(year, month - 1, 1);
        const endOfMonth = new Date(year, month, 0, 23, 59, 59);
        // Inisialisasi Hari Ini
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);
        // ==========================================
        // A. LOGIKA EMPLOYEE (Personal Analytics)
        // ==========================================
        if (user.role === client_1.Role.employee) {
            const [attendanceRecords, userData] = await Promise.all([
                prisma_1.default.attendance.findMany({
                    where: {
                        userId: user.id,
                        date: { gte: startOfMonth, lte: endOfMonth }
                    },
                    orderBy: { date: 'asc' }
                }),
                prisma_1.default.user.findUnique({
                    where: { id: user.id },
                    select: {
                        name: true,
                        role: true,
                        annual_leave_quota: true,
                        leave_balance: true
                    }
                })
            ]);
            // Kalkulasi Metrics
            const onTimeCount = attendanceRecords.filter(a => a.status === "OnTime").length;
            const lateCount = attendanceRecords.filter(a => a.status === "Late").length;
            const absentCount = 0; // Logika absent bisa dikembangkan berdasarkan hari kerja efektif
            const totalMinutes = attendanceRecords.reduce((acc, curr) => acc + (curr.workHours ? Number(curr.workHours) * 60 : 0), 0);
            // Sinkronisasi dengan DashboardSummary Interface di Frontend
            return res.json({
                success: true,
                data: {
                    userProfile: {
                        name: userData?.name || "Employee",
                        role: userData?.role || "Staff"
                    },
                    summaryMetrics: {
                        workHours: `${Math.floor(totalMinutes / 60)}h ${Math.round(totalMinutes % 60)}m`,
                        onTime: onTimeCount,
                        late: lateCount,
                        absent: absentCount
                    },
                    leaveSummary: {
                        totalQuota: userData?.annual_leave_quota || 0,
                        taken: (userData?.annual_leave_quota || 0) - (userData?.leave_balance || 0),
                        remaining: userData?.leave_balance || 0
                    },
                    attendanceStats: [
                        { name: "On Time", value: onTimeCount, color: "#aec2e0" },
                        { name: "Late", value: lateCount, color: "#7d8dbb" },
                        { name: "Absent", value: absentCount, color: "#f18684" }
                    ],
                    // Mapping untuk Bar Chart (Activity Harian)
                    dailyWorkLog: attendanceRecords.map(a => ({
                        name: new Date(a.date).getDate().toString(), // Label tanggal (1, 2, 3...)
                        hours: Number(a.workHours || 0),
                        label: new Date(a.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
                    }))
                }
            });
        }
        // ==========================================
        // B. LOGIKA SUPERADMIN (Global Market Insights)
        // ==========================================        
        if (user.role === client_1.Role.superadmin) {
            const [totalTenants, totalUsersGlobal, revenueData, recentTenants, planDistribution] = await Promise.all([
                // 1. Total Perusahaan yang mendaftar
                prisma_1.default.company.count(),
                // 2. Total seluruh karyawan aktif di semua tenant
                prisma_1.default.user.count({
                    where: { role: client_1.Role.employee, status: client_1.UserStatus.Active }
                }),
                // 3. Total Pendapatan (Sum dari semua transaksi sukses)
                prisma_1.default.transaction.aggregate({
                    where: { status: "Success" },
                    _sum: { amount: true }
                }),
                // 4. 5 Tenant Terbaru untuk Tabel Aktivitas
                prisma_1.default.company.findMany({
                    take: 5,
                    orderBy: { created_at: 'desc' },
                    include: {
                        subscription: { select: { planName: true, status: true } }
                    }
                }),
                // 5. Distribusi Paket untuk Bar/Pie Chart
                prisma_1.default.subscription.groupBy({
                    by: ['planName'],
                    _count: { planName: true }
                })
            ]);
            // Format Plan Distribution agar sesuai dengan Recharts di Frontend { name: string, value: number }
            let formattedPlanDistribution = planDistribution.map(p => ({
                name: p.planName || "Trial / No Plan",
                value: p._count.planName
            }));
            // Failsafe: Jika data kosong, berikan placeholder agar grafik tidak hilang
            if (formattedPlanDistribution.length === 0) {
                formattedPlanDistribution = [
                    { name: "Basic", value: 0 },
                    { name: "Pro", value: 0 },
                    { name: "Enterprise", value: 0 }
                ];
            }
            return res.json({
                success: true,
                data: {
                    totalTenants,
                    totalUsers: totalUsersGlobal,
                    totalRevenue: Number(revenueData._sum.amount || 0), // Konversi Decimal ke Number
                    recentTenants: recentTenants.map(t => ({
                        id: t.id,
                        name: t.name,
                        plan: t.subscription?.planName || "Trial",
                        status: t.subscription?.status || "Inactive"
                    })),
                    planDistribution: formattedPlanDistribution
                }
            });
        }
        // ==========================================
        // C. LOGIKA ADMIN (HR & Operations Control)
        // ==========================================
        const tenantId = user.companyId;
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const endOfToday = new Date();
        endOfToday.setHours(23, 59, 59, 999);
        const [totalEmployee, // 1
        activeEmployees, // 2
        newEmployees, // 3
        totalPayrollCurrentMonth, // 4 (PINDAH KE SINI)
        todayAttendance, // 5
        subscription, // 6
        contractStats // 7
        ] = await Promise.all([
            /* 1 */ prisma_1.default.user.count({ where: { companyId: tenantId, role: client_1.Role.employee } }),
            /* 2 */ prisma_1.default.user.count({ where: { companyId: tenantId, status: client_1.UserStatus.Active, role: client_1.Role.employee } }),
            /* 3 */ prisma_1.default.user.count({ where: { companyId: tenantId, role: client_1.Role.employee, join_date: { gte: startOfMonth, lte: endOfMonth } } }),
            /* 4 */ prisma_1.default.payroll.aggregate({
                where: { companyId: tenantId, month, year, status: "Paid" },
                _sum: { net_salary: true }
            }),
            /* 5 */ prisma_1.default.attendance.findMany({
                where: { date: { gte: startOfToday, lte: endOfToday }, user: { companyId: tenantId } },
                include: { user: { select: { name: true } } },
                orderBy: { clockIn: 'desc' }
            }),
            /* 6 */ prisma_1.default.subscription.findUnique({ where: { companyId: tenantId } }),
            /* 7 */ prisma_1.default.user.groupBy({
                by: ['contract_type'],
                where: { companyId: tenantId, role: client_1.Role.employee },
                _count: true
            })
        ]);
        // Proteksi kalkulasi angka
        const totalSalaryCalculated = Number(totalPayrollCurrentMonth._sum.net_salary || 0);
        const onTimeToday = todayAttendance.filter(a => a.status === "OnTime").length;
        const lateToday = todayAttendance.filter(a => a.status === "Late").length;
        const absentToday = activeEmployees - todayAttendance.length;
        return res.json({
            success: true,
            data: {
                totalEmployee,
                activeEmployees,
                newEmployees,
                totalSalary: totalSalaryCalculated,
                attendanceTodayStats: [
                    { name: "Late", value: lateToday, color: "#FFB800" },
                    { name: "Ontime", value: onTimeToday, color: "#FF8A65" },
                    { name: "Absent", value: absentToday < 0 ? 0 : absentToday, color: "#7986CB" }
                ],
                attendanceTable: todayAttendance.slice(0, 5).map(a => ({
                    nama: a.user.name,
                    status: a.status,
                    checkIn: a.clockIn ? new Date(a.clockIn).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : "--:--"
                })),
                employeeStatus: contractStats.map(c => ({
                    name: c.contract_type || "N/A",
                    value: c._count
                }))
            }
        });
    }
    catch (error) {
        console.error("Dashboard Error:", error.message);
        return res.status(500).json({ success: false, message: "Terjadi kesalahan sistem." });
    }
};
exports.getDashboard = getDashboard;
