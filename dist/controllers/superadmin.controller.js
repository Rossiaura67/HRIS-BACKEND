"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteMasterPlan = exports.getMasterPlanDetail = exports.deleteTenant = exports.seedDefaultPlans = exports.updateSubscription = exports.manualTransactionActivation = exports.getAllSystemTransactions = exports.upsertMasterPlan = exports.getMasterPlans = exports.terminateTenantAccess = exports.updateTenantStatus = exports.getTenantDetail = exports.getAllTenants = exports.getPlatformMetrics = void 0;
const client_1 = require("@prisma/client");
const prisma_1 = __importDefault(require("../utils/prisma"));
const subscription_controller_1 = require("./subscription.controller");
/**
 * 1. PLATFORM ANALYTICS
 */
const getPlatformMetrics = async (req, res) => {
    try {
        const [totalTenants, totalUsers, revenueData, recentTenants, planDistribution] = await Promise.all([
            prisma_1.default.company.count(),
            prisma_1.default.user.count({ where: { role: client_1.Role.employee, status: "Active" } }),
            prisma_1.default.transaction.aggregate({ where: { status: "Success" }, _sum: { amount: true } }),
            prisma_1.default.company.findMany({
                take: 5,
                orderBy: { created_at: 'desc' },
                include: { subscription: { select: { planName: true, status: true } } }
            }),
            prisma_1.default.subscription.groupBy({
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
    }
    catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
exports.getPlatformMetrics = getPlatformMetrics;
/**
 * 2. TENANT MANAGEMENT
 */
const getAllTenants = async (req, res) => {
    // Ambil page dan limit dari query string
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const [tenants, total] = await Promise.all([
        prisma_1.default.company.findMany({
            skip,
            take: limit,
            include: { subscription: true, _count: { select: { users: true } } },
            orderBy: { created_at: 'desc' }
        }),
        prisma_1.default.company.count()
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
exports.getAllTenants = getAllTenants;
const getTenantDetail = async (req, res) => {
    const tenant = await prisma_1.default.company.findUnique({
        where: { id: Number(req.params.id) },
        include: { subscription: true, users: { where: { role: client_1.Role.admin }, select: { name: true, email: true, phone: true } }, _count: { select: { users: true } } }
    });
    return tenant ? res.json({ success: true, data: tenant }) : res.status(404).json({ success: false });
};
exports.getTenantDetail = getTenantDetail;
const updateTenantStatus = async (req, res) => {
    const tenant = await prisma_1.default.company.update({ where: { id: Number(req.params.id) }, data: { status: req.body.status } });
    return res.json({ success: true, data: tenant });
};
exports.updateTenantStatus = updateTenantStatus;
const terminateTenantAccess = async (req, res) => {
    const { companyId } = req.params;
    await prisma_1.default.$transaction([
        prisma_1.default.company.update({ where: { id: Number(companyId) }, data: { status: client_1.UserStatus.Suspended } }),
        prisma_1.default.subscription.update({ where: { companyId: Number(companyId) }, data: { status: client_1.SubscriptionStatus.Expired } })
    ]);
    return res.json({ success: true, message: "Access terminated" });
};
exports.terminateTenantAccess = terminateTenantAccess;
/**
 * 3. MASTER PLAN (Product Catalog)
 */
const getMasterPlans = async (req, res) => {
    const plans = await prisma_1.default.masterPlan.findMany({ orderBy: { price: 'asc' } });
    return res.json({ success: true, data: plans });
};
exports.getMasterPlans = getMasterPlans;
const upsertMasterPlan = async (req, res) => {
    const { id, name, price, maxEmployees, durationDays, isActive, description } = req.body;
    const plan = await prisma_1.default.masterPlan.upsert({
        where: { id: id || 0 },
        update: { name, price: new client_1.Prisma.Decimal(price), maxEmployees: Number(maxEmployees), durationDays: Number(durationDays), isActive, description },
        create: { name, price: new client_1.Prisma.Decimal(price), maxEmployees: Number(maxEmployees), durationDays: Number(durationDays), isActive: isActive ?? true, description }
    });
    return res.json({ success: true, data: plan });
};
exports.upsertMasterPlan = upsertMasterPlan;
/**
 * 4. FINANCIAL AUDIT & MANUAL OVERRIDE
 */
const getAllSystemTransactions = async (req, res) => {
    const transactions = await prisma_1.default.transaction.findMany({ include: { company: { select: { name: true } } }, orderBy: { created_at: 'desc' } });
    return res.json({ success: true, data: transactions });
};
exports.getAllSystemTransactions = getAllSystemTransactions;
const manualTransactionActivation = async (req, res) => {
    try {
        const { transactionId } = req.params; // Sesuai dengan /:transactionId di rute
        await prisma_1.default.$transaction(async (tx) => {
            // Panggil helper yang sudah Anda buat sebelumnya
            await (0, subscription_controller_1.processSubscriptionActivation)(Number(transactionId), tx);
        });
        return res.json({ success: true, message: "Aktivasi manual berhasil." });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
exports.manualTransactionActivation = manualTransactionActivation;
const updateSubscription = async (req, res) => {
    const { companyId } = req.params;
    const updated = await prisma_1.default.subscription.update({ where: { companyId: Number(companyId) }, data: { ...req.body, endDate: req.body.endDate ? new Date(req.body.endDate) : undefined } });
    return res.json({ success: true, data: updated });
};
exports.updateSubscription = updateSubscription;
const seedDefaultPlans = async (req, res) => {
    const plans = [
        { name: "Basic", price: new client_1.Prisma.Decimal(250000), maxEmployees: 20, durationDays: 30, isActive: true, description: "Small UMKM" },
        { name: "Pro", price: new client_1.Prisma.Decimal(750000), maxEmployees: 100, durationDays: 30, isActive: true, description: "Growing Business" }
    ];
    await prisma_1.default.masterPlan.createMany({ data: plans, skipDuplicates: true });
    return res.json({ success: true, message: "Default plans seeded" });
};
exports.seedDefaultPlans = seedDefaultPlans;
const deleteTenant = async (req, res) => {
    try {
        const { id } = req.params;
        const companyId = Number(id);
        // 1. Cek jumlah pengguna di perusahaan tersebut
        const userCount = await prisma_1.default.user.count({
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
        await prisma_1.default.company.delete({
            where: { id: companyId }
        });
        return res.json({
            success: true,
            message: "Tenant telah berhasil dihapus secara permanen karena sudah tidak memiliki pengguna."
        });
    }
    catch (error) {
        return res.status(500).json({
            success: false,
            message: "Gagal menghapus tenant: " + error.message
        });
    }
};
exports.deleteTenant = deleteTenant;
const getMasterPlanDetail = async (req, res) => {
    const plan = await prisma_1.default.masterPlan.findUnique({
        where: { id: Number(req.params.id) }
    });
    return plan ? res.json({ success: true, data: plan }) : res.status(404).json({ success: false });
};
exports.getMasterPlanDetail = getMasterPlanDetail;
const deleteMasterPlan = async (req, res) => {
    try {
        const { id } = req.params;
        const inUse = await prisma_1.default.subscription.count({
            where: { planName: (await prisma_1.default.masterPlan.findUnique({ where: { id: Number(id) } }))?.name }
        });
        if (inUse > 0) {
            return res.status(400).json({
                success: false,
                message: "Plan tidak bisa dihapus karena sedang digunakan oleh beberapa tenant."
            });
        }
        await prisma_1.default.masterPlan.delete({ where: { id: Number(id) } });
        return res.json({ success: true, message: "Master Plan berhasil dihapus." });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
exports.deleteMasterPlan = deleteMasterPlan;
