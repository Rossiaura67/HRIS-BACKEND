import { Router } from "express";
import * as payrollController from "../controllers/payroll.controller";
import { authenticate, authorizeRoles } from "../middlewares/auth.middleware";
import { checkSubscription } from "../middlewares/subscription.middleware";
import { Role } from "@prisma/client";

const router = Router();

// Semua rute wajib login
router.use(authenticate); 

// Definisi Hak Akses
const adminOnly = authorizeRoles(Role.admin);
const managementAccess = authorizeRoles(Role.admin, Role.superadmin);
const adminWriteStack = [adminOnly, checkSubscription];

/**
 * ==========================================
 * ROLE: EMPLOYEE (SELF-SERVICE)
 * ==========================================
 */
router.get("/me", payrollController.getMyPayrolls);
router.get("/me/:id", payrollController.getPayrollDetail);

/**
 * ==========================================
 * ROLE: ADMIN ONLY (OPERATIONS)
 * ==========================================
 */
router.post("/generate", adminWriteStack, payrollController.generateMonthlyPayroll);
router.patch("/calculate/:id", adminWriteStack, payrollController.calculatePayroll); 
router.post("/approve-all", adminWriteStack, payrollController.approveAllMonthly);
router.post("/bulk-payment", adminWriteStack, payrollController.bulkPayment);
router.delete("/:id", adminWriteStack, payrollController.deletePayroll);

/**
 * ==========================================
 * ROLE: ADMIN & SUPERADMIN (REPORTING)
 * ==========================================
 */
router.get("/list", managementAccess, payrollController.getAllPayrolls);
router.get("/stats", managementAccess, payrollController.getPayrollStats);
router.get("/export-pdf", managementAccess, payrollController.exportPayrollToPDF);
router.get("/:id", managementAccess, payrollController.getPayrollDetail);

/**
 * ==========================================
 * ROLE: SUPERADMIN ONLY (SYSTEM AUDIT)
 * ==========================================
 */
router.get("/system/logs", authorizeRoles(Role.superadmin), payrollController.getGlobalPayrollLogs);

export default router;