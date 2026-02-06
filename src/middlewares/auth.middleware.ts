import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import prisma from "../utils/prisma";
import { User, Role, UserStatus } from "@prisma/client";

export type UserWithCompany = {
  id: number;
  companyId: number | null;
  name: string;
  email: string;
  role: Role; // Ini memastikan tipe Role adalah Enum Prisma, bukan string biasa
  status: UserStatus;
  profile_image: string | null;
  company: {
    status: UserStatus;
  } | null;
};

export interface AuthRequest extends Request {
  user?: UserWithCompany;
}

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "Akses ditolak: Token tidak ditemukan" });
    }

    const token = header.split(" ")[1];
    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) throw new Error("JWT_SECRET belum dikonfigurasi di .env");

    const decoded = jwt.verify(token, jwtSecret) as { id: number };

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        companyId: true,
        name: true,
        email: true,
        role: true, // Role diambil dari Enum Database
        status: true,
        profile_image: true,
        company: {
          select: { status: true }
        }
      }
    });

    if (!user) {
      return res.status(401).json({ success: false, message: "Sesi tidak valid" });
    }

    if (user.status !== UserStatus.Active) {
      return res.status(403).json({ 
        success: false, 
        message: `Akun Anda sedang ${user.status.toLowerCase()}.` 
      });
    }

    if (user.role !== Role.superadmin) {
      if (!user.company || user.company.status !== UserStatus.Active) {
        return res.status(403).json({ 
          success: false, 
          message: "Akses ditolak: Perusahaan tidak aktif." 
        });
      }
    }

    // Casting ke UserWithCompany sekarang sudah "aman" karena strukturnya sama
    req.user = user as UserWithCompany;
    next();
  } catch (err: any) {
    let msg = "Token tidak valid";
    if (err.name === "TokenExpiredError") msg = "Sesi berakhir, silakan login kembali";
    return res.status(401).json({ success: false, message: msg });
  }
};

export const authorizeRoles = (...roles: Role[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Autentikasi diperlukan" });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        success: false, 
        message: `Izin ditolak: Role ${req.user.role} tidak diizinkan mengakses rute ini` 
      });
    }

    next();
  };
};

export const adminOnly = authorizeRoles(Role.admin, Role.superadmin);