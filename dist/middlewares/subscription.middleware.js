"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkSubscription = void 0;
const prisma_1 = __importDefault(require("../utils/prisma"));
const client_1 = require("@prisma/client");
const checkSubscription = async (req, res, next) => {
    try {
        if (req.user?.role === client_1.Role.superadmin)
            return next();
        const companyId = req.user?.companyId;
        if (!companyId) {
            return res.status(401).json({ success: false, message: "Identitas perusahaan tidak ditemukan." });
        }
        const isCreateUserAction = req.method === "POST" && req.originalUrl.includes("/users");
        const sub = await prisma_1.default.subscription.findUnique({
            where: { companyId: Number(companyId) },
            include: isCreateUserAction ? {
                company: {
                    select: {
                        _count: {
                            select: {
                                users: { where: { role: client_1.Role.employee, status: client_1.UserStatus.Active } }
                            }
                        }
                    }
                }
            } : undefined
        });
        if (!sub) {
            return res.status(403).json({ success: false, message: "Perusahaan belum berlangganan paket apapun." });
        }
        const now = new Date();
        const isExpired = sub.status === client_1.SubscriptionStatus.Expired || new Date(sub.endDate) < now;
        if (isExpired) {
            return res.status(403).json({
                success: false,
                message: "Masa aktif paket Anda telah berakhir.",
                code: "SUBSCRIPTION_EXPIRED"
            });
        }
        if (sub.status === client_1.SubscriptionStatus.Inactive) {
            return res.status(403).json({ success: false, message: "Layanan perusahaan sedang dinonaktifkan." });
        }
        if (isCreateUserAction && sub.company) {
            const currentStaffCount = sub.company._count.users;
            const limit = Number(sub.maxEmployees);
            if (currentStaffCount >= limit) {
                return res.status(403).json({
                    success: false,
                    message: `Kuota penuh (Limit: ${limit}). Silakan upgrade paket.`,
                    code: "QUOTA_FULL"
                });
            }
        }
        req.activeSubscription = sub;
        next();
    }
    catch (error) {
        console.error("Subscription Error:", error);
        return res.status(500).json({ success: false, message: "Gagal memproses validasi langganan." });
    }
};
exports.checkSubscription = checkSubscription;
