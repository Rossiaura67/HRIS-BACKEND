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
const companyController = __importStar(require("../controllers/company.controller"));
const auth_middleware_1 = require("../middlewares/auth.middleware");
const subscription_middleware_1 = require("../middlewares/subscription.middleware");
const client_1 = require("@prisma/client");
const upload_middleware_1 = __importDefault(require("../middlewares/upload.middleware"));
const router = (0, express_1.Router)();
// Semua rute dalam file ini wajib melewati proses autentikasi (login)
router.use(auth_middleware_1.authenticate);
// Shortcut untuk otorisasi admin
const adminOnly = (0, auth_middleware_1.authorizeRoles)(client_1.Role.admin);
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
router.patch("/update", adminOnly, subscription_middleware_1.checkSubscription, companyController.updateCompany);
router.post("/logo", adminOnly, subscription_middleware_1.checkSubscription, upload_middleware_1.default.single("logo"), companyController.uploadLogo);
/**
 * ==========================================
 * 3. KONFIGURASI OPERASIONAL (Khusus Admin)
 * ==========================================
 */
// Mengambil pengaturan lokasi & jam kerja saat ini
router.get("/settings", adminOnly, companyController.getOfficeSettings);
// Update lokasi geofencing (Lat, Long, Radius)
router.put("/settings/location", adminOnly, subscription_middleware_1.checkSubscription, companyController.updateOfficeLocation);
// Update jam masuk standar
router.put("/settings/time", adminOnly, subscription_middleware_1.checkSubscription, companyController.updateWorkTime);
exports.default = router;
