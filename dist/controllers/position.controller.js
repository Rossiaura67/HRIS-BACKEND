"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMyPositionDetail = exports.deletePosition = exports.updatePosition = exports.createPosition = exports.getPositionById = exports.getAllPositions = void 0;
const prisma_1 = __importDefault(require("../utils/prisma"));
/**
 * 1. GET ALL POSITIONS (ADMIN ONLY)
 * Mengambil semua daftar jabatan di perusahaan Admin yang sedang login
 */
const getAllPositions = async (req, res) => {
    try {
        const admin = req.user;
        const positions = await prisma_1.default.positionSalary.findMany({
            where: { companyId: admin.companyId },
            include: {
                _count: { select: { users: true } } // Menghitung berapa karyawan di posisi ini
            },
            orderBy: { positionName: "asc" }
        });
        return res.json({ success: true, data: positions });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
exports.getAllPositions = getAllPositions;
/**
 * 2. GET POSITION BY ID (ADMIN ONLY)
 * Mengambil detail jabatan spesifik (untuk form edit)
 */
const getPositionById = async (req, res) => {
    try {
        const { id } = req.params;
        const position = await prisma_1.default.positionSalary.findFirst({
            where: {
                id: Number(id),
                companyId: req.user.companyId
            }
        });
        if (!position)
            return res.status(404).json({ success: false, message: "Jabatan tidak ditemukan" });
        return res.json({ success: true, data: position });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
exports.getPositionById = getPositionById;
/**
 * 3. CREATE POSITION (ADMIN ONLY)
 */
const createPosition = async (req, res) => {
    try {
        const { positionName, baseSalary, allowance, mealAllowance, transportAllowance, hourlyRate, lateDeductionPerMin } = req.body;
        const admin = req.user;
        // Validasi Duplikasi Nama Jabatan di Perusahaan yang sama
        const existing = await prisma_1.default.positionSalary.findFirst({
            where: {
                positionName,
                companyId: admin.companyId
            }
        });
        if (existing)
            return res.status(400).json({ success: false, message: "Nama jabatan sudah ada" });
        const newPosition = await prisma_1.default.positionSalary.create({
            data: {
                companyId: admin.companyId,
                positionName,
                baseSalary: Number(baseSalary),
                allowance: Number(allowance) || 0,
                mealAllowance: Number(mealAllowance) || 0,
                transportAllowance: Number(transportAllowance) || 0,
                hourlyRate: Number(hourlyRate) || 0,
                lateDeductionPerMin: Number(lateDeductionPerMin) || 0
            }
        });
        return res.status(201).json({ success: true, data: newPosition });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
exports.createPosition = createPosition;
/**
 * 4. UPDATE POSITION (ADMIN ONLY)
 */
const updatePosition = async (req, res) => {
    try {
        const { id } = req.params;
        const { positionName, baseSalary, allowance, mealAllowance, transportAllowance, hourlyRate, lateDeductionPerMin } = req.body;
        const companyId = req.user.companyId;
        // 1. Cek kepemilikan
        const target = await prisma_1.default.positionSalary.findFirst({
            where: { id: Number(id), companyId }
        });
        if (!target)
            return res.status(404).json({ success: false, message: "Jabatan tidak ditemukan" });
        // 2. CEK DUPLIKASI NAMA (Penting!)
        // Jika nama diubah, pastikan nama baru belum dipakai jabatan lain di PT yang sama
        if (positionName && positionName !== target.positionName) {
            const duplicate = await prisma_1.default.positionSalary.findFirst({
                where: { positionName, companyId, id: { not: Number(id) } }
            });
            if (duplicate)
                return res.status(400).json({ success: false, message: "Nama jabatan tersebut sudah ada" });
        }
        const updated = await prisma_1.default.positionSalary.update({
            where: { id: Number(id) },
            data: {
                positionName,
                baseSalary: baseSalary ? Number(baseSalary) : undefined,
                allowance: Number(allowance) || 0,
                mealAllowance: Number(mealAllowance) || 0,
                transportAllowance: Number(transportAllowance) || 0,
                hourlyRate: Number(hourlyRate) || 0,
                lateDeductionPerMin: Number(lateDeductionPerMin) || 0
            }
        });
        return res.json({ success: true, data: updated });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
exports.updatePosition = updatePosition;
/**
 * 5. DELETE POSITION (ADMIN ONLY)
 * Mencegah penghapusan jika masih ada karyawan yang terdaftar di jabatan ini
 */
const deletePosition = async (req, res) => {
    try {
        const { id } = req.params;
        const companyId = req.user.companyId;
        // 1. Pastikan posisi ini milik perusahaan si admin (Security Check)
        const position = await prisma_1.default.positionSalary.findFirst({
            where: { id: Number(id), companyId }
        });
        if (!position)
            return res.status(404).json({ success: false, message: "Jabatan tidak ditemukan di perusahaan Anda" });
        // 2. Cek apakah ada user yang menggunakan posisi ini
        const userCount = await prisma_1.default.user.count({
            where: { positionId: Number(id) }
        });
        if (userCount > 0) {
            return res.status(400).json({
                success: false,
                message: `Tidak bisa menghapus. Masih ada ${userCount} karyawan di jabatan ini.`
            });
        }
        await prisma_1.default.positionSalary.delete({
            where: { id: Number(id) }
        });
        return res.json({ success: true, message: "Jabatan berhasil dihapus" });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
exports.deletePosition = deletePosition;
/**
 * 6. GET MY POSITION DETAIL (EMPLOYEE SELF SERVICE)
 */
const getMyPositionDetail = async (req, res) => {
    try {
        const user = await prisma_1.default.user.findUnique({
            where: { id: req.user.id },
            include: { position: true } // Langsung ambil relasinya
        });
        if (!user?.position) {
            return res.status(404).json({ success: false, message: "Anda belum memiliki data jabatan/gaji" });
        }
        return res.json({ success: true, data: user.position });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
exports.getMyPositionDetail = getMyPositionDetail;
