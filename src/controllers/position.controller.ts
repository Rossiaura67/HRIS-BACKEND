import { Response } from "express";
import prisma from "../utils/prisma";
import { AuthRequest } from "../middlewares/auth.middleware";

/**
 * 1. GET ALL POSITIONS (ADMIN ONLY)
 * Mengambil semua daftar jabatan di perusahaan Admin yang sedang login
 */
export const getAllPositions = async (req: AuthRequest, res: Response) => {
    try {
        const admin = req.user!;
        const positions = await prisma.positionSalary.findMany({
            where: { companyId: admin.companyId! },
            include: {
                _count: { select: { users: true } } // Menghitung berapa karyawan di posisi ini
            },
            orderBy: { positionName: "asc" }
        });

        return res.json({ success: true, data: positions });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * 2. GET POSITION BY ID (ADMIN ONLY)
 * Mengambil detail jabatan spesifik (untuk form edit)
 */
export const getPositionById = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const position = await prisma.positionSalary.findFirst({
            where: { 
                id: Number(id),
                companyId: req.user!.companyId! 
            }
        });

        if (!position) return res.status(404).json({ success: false, message: "Jabatan tidak ditemukan" });

        return res.json({ success: true, data: position });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * 3. CREATE POSITION (ADMIN ONLY)
 */
export const createPosition = async (req: AuthRequest, res: Response) => {
    try {
        const { positionName, baseSalary, allowance, mealAllowance, transportAllowance, hourlyRate, lateDeductionPerMin } = req.body;
        const admin = req.user!;

        // Validasi Duplikasi Nama Jabatan di Perusahaan yang sama
        const existing = await prisma.positionSalary.findFirst({
            where: { 
                positionName, 
                companyId: admin.companyId! 
            }
        });

        if (existing) return res.status(400).json({ success: false, message: "Nama jabatan sudah ada" });

        const newPosition = await prisma.positionSalary.create({
            data: {
                companyId: admin.companyId!,
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
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * 4. UPDATE POSITION (ADMIN ONLY)
 */
export const updatePosition = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { positionName, baseSalary, allowance, mealAllowance, transportAllowance, hourlyRate, lateDeductionPerMin } = req.body;
        const companyId = req.user!.companyId!;

        // 1. Cek kepemilikan
        const target = await prisma.positionSalary.findFirst({
            where: { id: Number(id), companyId }
        });
        if (!target) return res.status(404).json({ success: false, message: "Jabatan tidak ditemukan" });

        // 2. CEK DUPLIKASI NAMA (Penting!)
        // Jika nama diubah, pastikan nama baru belum dipakai jabatan lain di PT yang sama
        if (positionName && positionName !== target.positionName) {
            const duplicate = await prisma.positionSalary.findFirst({
                where: { positionName, companyId, id: { not: Number(id) } }
            });
            if (duplicate) return res.status(400).json({ success: false, message: "Nama jabatan tersebut sudah ada" });
        }

        const updated = await prisma.positionSalary.update({
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
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * 5. DELETE POSITION (ADMIN ONLY)
 * Mencegah penghapusan jika masih ada karyawan yang terdaftar di jabatan ini
 */
export const deletePosition = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const companyId = req.user!.companyId!;

        // 1. Pastikan posisi ini milik perusahaan si admin (Security Check)
        const position = await prisma.positionSalary.findFirst({
            where: { id: Number(id), companyId }
        });

        if (!position) return res.status(404).json({ success: false, message: "Jabatan tidak ditemukan di perusahaan Anda" });

        // 2. Cek apakah ada user yang menggunakan posisi ini
        const userCount = await prisma.user.count({
            where: { positionId: Number(id) }
        });

        if (userCount > 0) {
            return res.status(400).json({ 
                success: false, 
                message: `Tidak bisa menghapus. Masih ada ${userCount} karyawan di jabatan ini.` 
            });
        }

        await prisma.positionSalary.delete({
            where: { id: Number(id) }
        });

        return res.json({ success: true, message: "Jabatan berhasil dihapus" });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * 6. GET MY POSITION DETAIL (EMPLOYEE SELF SERVICE)
 */
export const getMyPositionDetail = async (req: AuthRequest, res: Response) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user!.id },
            include: { position: true } // Langsung ambil relasinya
        });

        if (!user?.position) {
            return res.status(404).json({ success: false, message: "Anda belum memiliki data jabatan/gaji" });
        }

        return res.json({ success: true, data: user.position });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};