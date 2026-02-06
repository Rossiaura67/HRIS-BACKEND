"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const leaveController = __importStar(require("../controllers/leave.controller"));
const auth_middleware_1 = require("../middlewares/auth.middleware");
const subscription_middleware_1 = require("../middlewares/subscription.middleware");
const upload_middleware_1 = __importDefault(require("../middlewares/upload.middleware"));
const client_1 = require("@prisma/client"); // Gunakan Enum Prisma agar konsisten
const router = (0, express_1.Router)();
// --- 1. GLOBAL AUTHENTICATION ---
// Semua rute di bawah ini wajib login
router.use(auth_middleware_1.authenticate);
// Middleware Stack untuk Admin Perusahaan
const adminAccess = (0, auth_middleware_1.authorizeRoles)(client_1.Role.admin);
// Middleware Stack untuk Superadmin Sistem
const superadminAccess = (0, auth_middleware_1.authorizeRoles)(client_1.Role.superadmin);
/**
 * ==========================================
 * 2. SHARED ACCESS (Employee & Admin)
 * ==========================================
 */
router.get("/", leaveController.getLeaves);
router.get("/detail/:id", leaveController.getLeaveDetail);
/**
 * ==========================================
 * 3. EMPLOYEE SELF-SERVICE
 * ==========================================
 */
router.get("/my-quota", leaveController.getLeaveQuota);
// FIX: Hapus 'authenticate' di sini karena sudah ada di router.use global
// PENTING: upload.single harus sebelum controller agar req.file terbaca
router.post("/request", subscription_middleware_1.checkSubscription, upload_middleware_1.default.single("evidence"), leaveController.requestLeave);
router.delete("/cancel/:id", subscription_middleware_1.checkSubscription, leaveController.cancelLeave);
/**
 * ==========================================
 * 4. ADMIN MANAGEMENT (Per Company)
 * ==========================================
 */
// Tambahkan checkSubscription agar admin tidak bisa memproses cuti jika langganan mati
router.patch("/review/:id", adminAccess, subscription_middleware_1.checkSubscription, leaveController.reviewLeave);
router.get("/active-today", adminAccess, leaveController.getActiveLeavesToday);
router.get("/stats/summary", adminAccess, leaveController.getLeaveStats);
/**
 * ==========================================
 * 5. SUPERADMIN SYSTEM LOGS (Global)
 * ==========================================
 */
router.get("/system/all-logs", superadminAccess, leaveController.getSystemWideLeaves);
exports.default = router;
