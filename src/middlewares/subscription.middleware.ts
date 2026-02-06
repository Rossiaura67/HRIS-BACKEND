import { Response, NextFunction } from "express";
import prisma from "../utils/prisma";
import { AuthRequest } from "./auth.middleware";
import { SubscriptionStatus, Role, UserStatus, Subscription } from "@prisma/client";

interface SubscriptionWithCount extends Subscription {
    company?: {
        _count: {
            users: number;
        };
    };
}

export interface SubRequest extends AuthRequest {
    activeSubscription?: Subscription; 
}

export const checkSubscription = async (req: SubRequest, res: Response, next: NextFunction) => {
    try {
        if (req.user?.role === Role.superadmin) return next();

        const companyId = req.user?.companyId;
        if (!companyId) {
            return res.status(401).json({ success: false, message: "Identitas perusahaan tidak ditemukan." });
        }

        const isCreateUserAction = req.method === "POST" && req.originalUrl.includes("/users");

        const sub = await prisma.subscription.findUnique({
            where: { companyId: Number(companyId) },
            include: isCreateUserAction ? {
                company: {
                    select: {
                        _count: {
                            select: { 
                                users: { where: { role: Role.employee, status: UserStatus.Active } } 
                            }
                        }
                    }
                }
            } : undefined
        }) as SubscriptionWithCount | null;

        if (!sub) {
            return res.status(403).json({ success: false, message: "Perusahaan belum berlangganan paket apapun." });
        }

        const now = new Date();
        const isExpired = sub.status === SubscriptionStatus.Expired || new Date(sub.endDate) < now;

        if (isExpired) {
            return res.status(403).json({ 
                success: false, 
                message: "Masa aktif paket Anda telah berakhir.",
                code: "SUBSCRIPTION_EXPIRED"
            });
        }

        if (sub.status === SubscriptionStatus.Inactive) {
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
    } catch (error: any) {
        console.error("Subscription Error:", error);
        return res.status(500).json({ success: false, message: "Gagal memproses validasi langganan." });
    }
};