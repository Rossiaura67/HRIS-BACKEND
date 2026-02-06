"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateWorkTime = exports.updateOfficeLocation = exports.getOfficeSettings = exports.uploadLogo = exports.updateCompany = exports.getCompanyProfile = void 0;
const client_1 = require("@prisma/client");
const prisma_1 = __importDefault(require("../utils/prisma"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
/**
 * ==========================================
 * 1. PROFIL PERUSAHAAN (Basic Info)
 * ==========================================
 */
const getCompanyProfile = async (req, res) => {
    try {
        const companyId = req.user?.companyId;
        if (!companyId)
            return res.status(404).json({ success: false, message: "Akses ditolak (System User)." });
        const company = await prisma_1.default.company.findUnique({
            where: { id: companyId },
            include: {
                _count: { select: { users: true } },
                subscription: true
            }
        });
        return res.json({ success: true, data: company });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
exports.getCompanyProfile = getCompanyProfile;
const updateCompany = async (req, res) => {
    try {
        const { name, address, domain } = req.body;
        const companyId = req.user.companyId;
        const updated = await prisma_1.default.company.update({
            where: { id: companyId },
            data: { name, address, domain }
        });
        await prisma_1.default.auditLog.create({
            data: {
                companyId,
                userId: req.user.id,
                action: "UPDATE_COMPANY_INFO",
                details: "Memperbarui profil dasar perusahaan."
            }
        });
        return res.json({ success: true, message: "Profil berhasil diperbarui", data: updated });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
exports.updateCompany = updateCompany;
const uploadLogo = async (req, res) => {
    try {
        if (!req.file)
            return res.status(400).json({ success: false, message: "File logo wajib diunggah." });
        const companyId = req.user.companyId;
        const company = await prisma_1.default.company.findUnique({ where: { id: companyId } });
        if (company?.logo) {
            const oldPath = path_1.default.join(process.cwd(), "public/logos", company.logo);
            if (fs_1.default.existsSync(oldPath))
                fs_1.default.unlinkSync(oldPath);
        }
        const updated = await prisma_1.default.company.update({
            where: { id: companyId },
            data: { logo: req.file.filename }
        });
        return res.json({ success: true, message: "Logo berhasil diperbarui", data: updated.logo });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
exports.uploadLogo = uploadLogo;
/**
 * ==========================================
 * 2. PENGATURAN KANTOR & ABSENSI (Settings)
 * ==========================================
 */
/**
 * Mendapatkan data lokasi kantor dan jam masuk saat ini
 */
const getOfficeSettings = async (req, res) => {
    try {
        const companyId = req.user.companyId;
        const [office, timeSetting] = await Promise.all([
            prisma_1.default.officeSetting.findFirst({ where: { companyId } }),
            prisma_1.default.attendanceSetting.findUnique({
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
    }
    catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
exports.getOfficeSettings = getOfficeSettings;
/**
 * Update lokasi Geofencing (Lat, Long, Radius)
 */
const updateOfficeLocation = async (req, res) => {
    try {
        const { officeName, latitude, longitude, radius } = req.body;
        const companyId = req.user.companyId;
        // Cari ID setting jika sudah ada
        const existing = await prisma_1.default.officeSetting.findFirst({ where: { companyId } });
        const office = await prisma_1.default.officeSetting.upsert({
            where: { id: existing?.id || 0 },
            update: {
                officeName,
                latitude: new client_1.Prisma.Decimal(latitude),
                longitude: new client_1.Prisma.Decimal(longitude),
                radius: Number(radius)
            },
            create: {
                companyId,
                officeName,
                latitude: new client_1.Prisma.Decimal(latitude),
                longitude: new client_1.Prisma.Decimal(longitude),
                radius: Number(radius)
            }
        });
        return res.json({ success: true, message: "Pengaturan lokasi berhasil disimpan", data: office });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
exports.updateOfficeLocation = updateOfficeLocation;
/**
 * Update jam masuk standar karyawan
 */
const updateWorkTime = async (req, res) => {
    try {
        const { clockInTime } = req.body; // Format "HH:mm"
        const companyId = req.user.companyId;
        const setting = await prisma_1.default.attendanceSetting.upsert({
            where: { companyId_name: { companyId, name: "clockInTime" } },
            update: { value: clockInTime },
            create: { companyId, name: "clockInTime", value: clockInTime }
        });
        return res.json({ success: true, message: "Jam kerja berhasil diperbarui", data: setting });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
exports.updateWorkTime = updateWorkTime;
