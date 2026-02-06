"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminOnly = exports.authorizeRoles = exports.authenticate = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const prisma_1 = __importDefault(require("../utils/prisma"));
const client_1 = require("@prisma/client");
const authenticate = async (req, res, next) => {
    try {
        const header = req.headers.authorization;
        if (!header || !header.startsWith("Bearer ")) {
            return res.status(401).json({ success: false, message: "Akses ditolak: Token tidak ditemukan" });
        }
        const token = header.split(" ")[1];
        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret)
            throw new Error("JWT_SECRET belum dikonfigurasi di .env");
        const decoded = jsonwebtoken_1.default.verify(token, jwtSecret);
        const user = await prisma_1.default.user.findUnique({
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
        if (user.status !== client_1.UserStatus.Active) {
            return res.status(403).json({
                success: false,
                message: `Akun Anda sedang ${user.status.toLowerCase()}.`
            });
        }
        if (user.role !== client_1.Role.superadmin) {
            if (!user.company || user.company.status !== client_1.UserStatus.Active) {
                return res.status(403).json({
                    success: false,
                    message: "Akses ditolak: Perusahaan tidak aktif."
                });
            }
        }
        // Casting ke UserWithCompany sekarang sudah "aman" karena strukturnya sama
        req.user = user;
        next();
    }
    catch (err) {
        let msg = "Token tidak valid";
        if (err.name === "TokenExpiredError")
            msg = "Sesi berakhir, silakan login kembali";
        return res.status(401).json({ success: false, message: msg });
    }
};
exports.authenticate = authenticate;
const authorizeRoles = (...roles) => {
    return (req, res, next) => {
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
exports.authorizeRoles = authorizeRoles;
exports.adminOnly = (0, exports.authorizeRoles)(client_1.Role.admin, client_1.Role.superadmin);
