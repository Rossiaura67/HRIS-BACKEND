"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCompanyAuditLogs = exports.getGlobalAuditLogs = void 0;
const prisma_1 = __importDefault(require("../utils/prisma"));
/**
 * ==========================================
 * ROLE: SUPERADMIN ONLY
 * ==========================================
 */
const getGlobalAuditLogs = async (req, res) => {
    try {
        const { action, companyId, startDate, endDate, search, page = 1, limit = 20 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const where = {};
        if (action)
            where.action = String(action);
        if (companyId)
            where.companyId = Number(companyId);
        if (search)
            where.details = { contains: String(search) };
        if (startDate || endDate) {
            where.created_at = {
                gte: startDate ? new Date(String(startDate)) : undefined,
                lte: endDate ? new Date(String(endDate)) : undefined,
            };
        }
        const [logs, total] = await Promise.all([
            prisma_1.default.auditLog.findMany({
                where,
                include: {
                    user: { select: { name: true, email: true } },
                    company: { select: { name: true } }
                },
                orderBy: { created_at: "desc" },
                take: Number(limit),
                skip: skip,
            }),
            prisma_1.default.auditLog.count({ where })
        ]);
        return res.json({
            success: true,
            data: logs,
            pagination: {
                total,
                page: Number(page),
                limit: Number(limit),
                totalPages: Math.ceil(total / Number(limit))
            }
        });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
exports.getGlobalAuditLogs = getGlobalAuditLogs;
/**
 * ==========================================
 * ROLE: COMPANY ADMIN
 * ==========================================
 */
const getCompanyAuditLogs = async (req, res) => {
    try {
        const admin = req.user;
        const { action, userId, startDate, endDate, search, page = 1, limit = 20 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const where = {
            companyId: admin.companyId
        };
        if (action)
            where.action = String(action);
        if (userId)
            where.userId = Number(userId);
        if (search)
            where.details = { contains: String(search) };
        if (startDate || endDate) {
            where.created_at = {
                gte: startDate ? new Date(String(startDate)) : undefined,
                lte: endDate ? new Date(String(endDate)) : undefined,
            };
        }
        const [logs, total] = await Promise.all([
            prisma_1.default.auditLog.findMany({
                where,
                include: {
                    user: { select: { name: true, email: true, employeeId: true } }
                },
                orderBy: { created_at: "desc" },
                take: Number(limit),
                skip: skip,
            }),
            prisma_1.default.auditLog.count({ where })
        ]);
        return res.json({
            success: true,
            data: logs,
            pagination: {
                total,
                page: Number(page),
                limit: Number(limit),
                totalPages: Math.ceil(total / Number(limit))
            }
        });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
exports.getCompanyAuditLogs = getCompanyAuditLogs;
