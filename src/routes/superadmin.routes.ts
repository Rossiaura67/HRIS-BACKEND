import { Router } from "express";
import { Role } from "@prisma/client";
import * as superController from "../controllers/superadmin.controller";
import { authenticate, authorizeRoles } from "../middlewares/auth.middleware";

const router = Router();

/**
 * KEAMANAN GLOBAL: 
 * Semua rute di bawah ini wajib Login (authenticate) 
 * dan memiliki Role Superadmin.
 */
router.use(authenticate, authorizeRoles(Role.superadmin));

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

export default router;