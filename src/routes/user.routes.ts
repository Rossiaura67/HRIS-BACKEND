import { Router } from "express";
import { Role } from "@prisma/client";
import * as userController from "../controllers/user.controller";
import { authenticate, authorizeRoles } from "../middlewares/auth.middleware";
import { checkSubscription } from "../middlewares/subscription.middleware"; 
import upload from "../middlewares/upload.middleware"; 

const router = Router();

// --- 1. GLOBAL AUTHENTICATION ---
router.use(authenticate); 

// --- 2. MIDDLEWARE STACKS ---
const managementAccess = authorizeRoles(Role.admin, Role.superadmin);
const uploadImg = upload.single("profile_image");
const adminWriteStack = [managementAccess, checkSubscription];

/**
 * ==========================================
 * 3. SELF SERVICE (Semua Role: Employee, Admin, Superadmin)
 * ==========================================
 */
router.patch("/me", uploadImg, userController.updateProfile);
router.patch("/me/password", userController.changePassword);
router.post("/me/photo", uploadImg, userController.uploadProfileImage);

// --- Penambahan Rute Notifikasi ---
router.get("/notifications", userController.getMyNotifications);
router.patch("/notifications/read", userController.markNotificationAsRead);

/**
 * ==========================================
 * 4. STAFF MANAGEMENT (Hanya Admin & Superadmin)
 * ==========================================
 */

// Dropdown Jabatan
router.get("/positions", managementAccess, userController.getPositions);

// Operasi List & Create
router.get("/", managementAccess, userController.getAllUsers);

// Tambah Karyawan (Cek kuota subscription via middleware)
router.post("/", [uploadImg, ...adminWriteStack], userController.createUser);

/**
 * Operasi Berbasis ID
 */
router.route("/:id")
    .get(managementAccess, userController.getUserById)
    .patch([uploadImg, managementAccess, checkSubscription], userController.updateUser)
    .delete(adminWriteStack, userController.deleteUser);

// Kontrol Akun
router.patch("/:id/status", adminWriteStack, userController.updateUserStatus);
router.patch("/:id/reset-password", managementAccess, userController.adminResetPassword);

export default router;