"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
const client_1 = require("@prisma/client");
// Gunakan instance yang sudah ada di global atau buat baru jika belum ada
exports.prisma = global.prisma ??
    new client_1.PrismaClient({
        // Aktifkan log hanya pada level tertentu agar console tidak terlalu berisik
        log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
    });
// Simpan instance ke global jika tidak sedang di lingkungan produksi
if (process.env.NODE_ENV !== "production") {
    global.prisma = exports.prisma;
}
exports.default = exports.prisma;
