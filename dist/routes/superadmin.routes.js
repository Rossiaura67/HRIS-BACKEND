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
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const superController = __importStar(require("../controllers/superadmin.controller"));
const auth_middleware_1 = require("../middlewares/auth.middleware");
const router = (0, express_1.Router)();
/**
 * KEAMANAN GLOBAL:
 * Semua rute di bawah ini wajib Login (authenticate)
 * dan memiliki Role Superadmin.
 */
router.use(auth_middleware_1.authenticate, (0, auth_middleware_1.authorizeRoles)(client_1.Role.superadmin));
/**
 * ==========================================
 * 1. ANALYTICS & MONITORING
 * ==========================================
 */
router.get("/metrics", superController.getPlatformMetrics);
router.get("/billing/transactions", superController.getAllSystemTransactions);
/**
 * ==========================================
 * 2. TENANT MANAGEMENT (Perusahaan/Pelanggan)
 * ==========================================
 */
router.get("/tenants", superController.getAllTenants);
router.get("/tenants/:id", superController.getTenantDetail);
router.patch("/tenants/:id/status", superController.updateTenantStatus);
// Hard Delete: Hapus permanen jika user sudah 0
router.delete("/tenants/:id", superController.deleteTenant);
// Soft Delete: Hanya blokir akses/suspensi
router.delete("/tenants/:companyId/terminate", superController.terminateTenantAccess);
/**
 * ==========================================
 * 3. SUBSCRIPTION & PLAN MANAGEMENT
 * ==========================================
 */
router.get("/master-plans", superController.getMasterPlans);
// TAMBAHAN: Ambil detail satu paket (Penting untuk edit form di frontend)
router.get("/master-plans/:id", superController.getMasterPlanDetail);
router.post("/master-plans", superController.upsertMasterPlan);
// TAMBAHAN: Hapus paket langganan
router.delete("/master-plans/:id", superController.deleteMasterPlan);
router.patch("/tenants/:companyId/subscription", superController.updateSubscription);
/**
 * ==========================================
 * 4. MANUAL INTERVENTION & OPERATIONS
 * ==========================================
 */
router.post("/billing/activate-manual/:transactionId", superController.manualTransactionActivation);
router.post("/operations/seed-plans", superController.seedDefaultPlans);
exports.default = router;
