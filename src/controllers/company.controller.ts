import { Response } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../utils/prisma";
import { AuthRequest } from "../middlewares/auth.middleware";
import fs from "fs";
import path from "path";

/**
 * ==========================================
 * 1. PROFIL PERUSAHAAN (Basic Info)
 * ==========================================
 */

export const getCompanyProfile = async (req: AuthRequest, res: Response) => {
    try {
        const companyId = req.user?.companyId;
        if (!companyId) return res.status(404).json({ success: false, message: "Akses ditolak (System User)." });

        const company = await prisma.company.findUnique({
            where: { id: companyId },
            include: {
                _count: { select: { users: true } },
                subscription: true 
            }
        });

        return res.json({ success: true, data: company });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const updateCompany = async (req: AuthRequest, res: Response) => {
    try {
        const { name, address, domain } = req.body;
        const companyId = req.user!.companyId!;

        const updated = await prisma.company.update({
            where: { id: companyId },
            data: { name, address, domain }
        });

        await prisma.auditLog.create({
            data: {
                companyId,
                userId: req.user!.id,
                action: "UPDATE_COMPANY_INFO",
                details: "Memperbarui profil dasar perusahaan."
            }
        });

        return res.json({ success: true, message: "Profil berhasil diperbarui", data: updated });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const uploadLogo = async (req: AuthRequest, res: Response) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: "File logo wajib diunggah." });

        const companyId = req.user!.companyId!;
        const company = await prisma.company.findUnique({ where: { id: companyId } });

        if (company?.logo) {
            const oldPath = path.join(process.cwd(), "public/logos", company.logo);
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }

        const updated = await prisma.company.update({
            where: { id: companyId },
            data: { logo: req.file.filename }
        });

        return res.json({ success: true, message: "Logo berhasil diperbarui", data: updated.logo });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * ==========================================
 * 2. PENGATURAN KANTOR & ABSENSI (Settings)
 * ==========================================
 */

/**
 * Mendapatkan data lokasi kantor dan jam masuk saat ini
 */
export const getOfficeSettings = async (req: AuthRequest, res: Response) => {
    try {
        const companyId = req.user!.companyId!;

        const [office, timeSetting] = await Promise.all([
            prisma.officeSetting.findFirst({ where: { companyId } }),
            prisma.attendanceSetting.findUnique({
                where: { companyId_name: { companyId, name: "clockInTime" } }
            })
        ]);

        return res.json({
            success: true,
            data: {
                office,
                clockInTime: timeSetting?.value || "08:00"
            }
        });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Update lokasi Geofencing (Lat, Long, Radius)
 */
export const updateOfficeLocation = async (req: AuthRequest, res: Response) => {
    try {
        const { officeName, latitude, longitude, radius } = req.body;
        const companyId = req.user!.companyId!;

        // Cari ID setting jika sudah ada
        const existing = await prisma.officeSetting.findFirst({ where: { companyId } });

        const office = await prisma.officeSetting.upsert({
            where: { id: existing?.id || 0 },
            update: {
                officeName,
                latitude: new Prisma.Decimal(latitude),
                longitude: new Prisma.Decimal(longitude),
                radius: Number(radius)
            },
            create: {
                companyId,
                officeName,
                latitude: new Prisma.Decimal(latitude),
                longitude: new Prisma.Decimal(longitude),
                radius: Number(radius)
            }
        });

        return res.json({ success: true, message: "Pengaturan lokasi berhasil disimpan", data: office });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Update jam masuk standar karyawan
 */
export const updateWorkTime = async (req: AuthRequest, res: Response) => {
    try {
        const { clockInTime } = req.body; // Format "HH:mm"
        const companyId = req.user!.companyId!;

        const setting = await prisma.attendanceSetting.upsert({
            where: { companyId_name: { companyId, name: "clockInTime" } },
            update: { value: clockInTime },
            create: { companyId, name: "clockInTime", value: clockInTime }
        });

        return res.json({ success: true, message: "Jam kerja berhasil diperbarui", data: setting });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};