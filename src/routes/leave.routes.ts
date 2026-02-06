import { Router } from "express";
import * as leaveController from "../controllers/leave.controller";
import { authenticate, authorizeRoles } from "../middlewares/auth.middleware"; 
import { checkSubscription } from "../middlewares/subscription.middleware"; 
import upload from "../middlewares/upload.middleware"; 
import { Role } from "@prisma/client"; // Gunakan Enum Prisma agar konsisten

const router = Router();

// --- 1. GLOBAL AUTHENTICATION ---
// Semua rute di bawah ini wajib login
router.use(authenticate);

// Middleware Stack untuk Admin Perusahaan
const adminAccess = authorizeRoles(Role.admin);
// Middleware Stack untuk Superadmin Sistem
const superadminAccess = authorizeRoles(Role.superadmin);

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
router.post(
    "/request", 
    checkSubscription, 
    upload.single("evidence"), 
    leaveController.requestLeave
);

router.delete("/cancel/:id", checkSubscription, leaveController.cancelLeave);

/**
 * ==========================================
 * 4. ADMIN MANAGEMENT (Per Company)
 * ==========================================
 */
// Tambahkan checkSubscription agar admin tidak bisa memproses cuti jika langganan mati
router.patch("/review/:id", adminAccess, checkSubscription, leaveController.reviewLeave);
router.get("/active-today", adminAccess, leaveController.getActiveLeavesToday);
router.get("/stats/summary", adminAccess, leaveController.getLeaveStats);

/**
 * ==========================================
 * 5. SUPERADMIN SYSTEM LOGS (Global)
 * ==========================================
 */
router.get("/system/all-logs", superadminAccess, leaveController.getSystemWideLeaves);

export default router;