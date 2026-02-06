import { Router } from "express";
import * as companyController from "../controllers/company.controller";
import { authenticate, authorizeRoles } from "../middlewares/auth.middleware";
import { checkSubscription } from "../middlewares/subscription.middleware";
import { Role } from "@prisma/client";
import upload from "../middlewares/upload.middleware";

const router = Router();

// Semua rute dalam file ini wajib melewati proses autentikasi (login)
router.use(authenticate);

// Shortcut untuk otorisasi admin
const adminOnly = authorizeRoles(Role.admin);

/**
 * ==========================================
 * 1. INFORMASI PUBLIK (Karyawan & Admin)
 * ==========================================
 */
router.get("/profile", companyController.getCompanyProfile);

/**
 * ==========================================
 * 2. MANAJEMEN IDENTITAS (Khusus Admin)
 * ==========================================
 */
router.patch("/update", adminOnly, checkSubscription, companyController.updateCompany);
router.post("/logo", adminOnly, checkSubscription, upload.single("logo"), companyController.uploadLogo);

/**
 * ==========================================
 * 3. KONFIGURASI OPERASIONAL (Khusus Admin)
 * ==========================================
 */

// Mengambil pengaturan lokasi & jam kerja saat ini
router.get("/settings", adminOnly, companyController.getOfficeSettings);

// Update lokasi geofencing (Lat, Long, Radius)
router.put("/settings/location", adminOnly, checkSubscription, companyController.updateOfficeLocation);

// Update jam masuk standar
router.put("/settings/time", adminOnly, checkSubscription, companyController.updateWorkTime);

export default router;