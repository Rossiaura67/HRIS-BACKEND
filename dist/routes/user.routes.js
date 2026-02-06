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
const client_1 = require("@prisma/client");
const userController = __importStar(require("../controllers/user.controller"));
const auth_middleware_1 = require("../middlewares/auth.middleware");
const subscription_middleware_1 = require("../middlewares/subscription.middleware");
const upload_middleware_1 = __importDefault(require("../middlewares/upload.middleware"));
const router = (0, express_1.Router)();
// --- 1. GLOBAL AUTHENTICATION ---
router.use(auth_middleware_1.authenticate);
// --- 2. MIDDLEWARE STACKS ---
const managementAccess = (0, auth_middleware_1.authorizeRoles)(client_1.Role.admin, client_1.Role.superadmin);
const uploadImg = upload_middleware_1.default.single("profile_image");
const adminWriteStack = [managementAccess, subscription_middleware_1.checkSubscription];
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
    .patch([uploadImg, managementAccess, subscription_middleware_1.checkSubscription], userController.updateUser)
    .delete(adminWriteStack, userController.deleteUser);
// Kontrol Akun
router.patch("/:id/status", adminWriteStack, userController.updateUserStatus);
router.patch("/:id/reset-password", managementAccess, userController.adminResetPassword);
exports.default = router;
