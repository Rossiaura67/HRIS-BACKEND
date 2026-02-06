import { Response } from "express";
import prisma from "../utils/prisma";
import { AuthRequest } from "../middlewares/auth.middleware";

/**
 * ==========================================
 * ROLE: SUPERADMIN ONLY
 * ==========================================
 */
export const getGlobalAuditLogs = async (req: AuthRequest, res: Response) => {
    try {
        const { action, companyId, startDate, endDate, search, page = 1, limit = 20 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const where: any = {};
        
        if (action) where.action = String(action);
        if (companyId) where.companyId = Number(companyId);
        if (search) where.details = { contains: String(search) };
        
        if (startDate || endDate) {
            where.created_at = {
                gte: startDate ? new Date(String(startDate)) : undefined,
                lte: endDate ? new Date(String(endDate)) : undefined,
            };
        }

        const [logs, total] = await Promise.all([
            prisma.auditLog.findMany({
                where,
                include: {
                    user: { select: { name: true, email: true } },
                    company: { select: { name: true } }
                },
                orderBy: { created_at: "desc" },
                take: Number(limit),
                skip: skip,
            }),
            prisma.auditLog.count({ where })
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
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * ==========================================
 * ROLE: COMPANY ADMIN
 * ==========================================
 */
export const getCompanyAuditLogs = async (req: AuthRequest, res: Response) => {
    try {
        const admin = req.user!;
        const { action, userId, startDate, endDate, search, page = 1, limit = 20 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const where: any = {
            companyId: admin.companyId
        };

        if (action) where.action = String(action);
        if (userId) where.userId = Number(userId);
        if (search) where.details = { contains: String(search) };

        if (startDate || endDate) {
            where.created_at = {
                gte: startDate ? new Date(String(startDate)) : undefined,
                lte: endDate ? new Date(String(endDate)) : undefined,
            };
        }

        const [logs, total] = await Promise.all([
            prisma.auditLog.findMany({
                where,
                include: {
                    user: { select: { name: true, email: true, employeeId: true } }
                },
                orderBy: { created_at: "desc" },
                take: Number(limit),
                skip: skip,
            }),
            prisma.auditLog.count({ where })
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
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};