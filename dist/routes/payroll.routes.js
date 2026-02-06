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
const payrollController = __importStar(require("../controllers/payroll.controller"));
const auth_middleware_1 = require("../middlewares/auth.middleware");
const subscription_middleware_1 = require("../middlewares/subscription.middleware");
const client_1 = require("@prisma/client");
const router = (0, express_1.Router)();
// Semua rute wajib login
router.use(auth_middleware_1.authenticate);
// Definisi Hak Akses
const adminOnly = (0, auth_middleware_1.authorizeRoles)(client_1.Role.admin);
const managementAccess = (0, auth_middleware_1.authorizeRoles)(client_1.Role.admin, client_1.Role.superadmin);
const adminWriteStack = [adminOnly, subscription_middleware_1.checkSubscription];
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
router.get("/system/logs", (0, auth_middleware_1.authorizeRoles)(client_1.Role.superadmin), payrollController.getGlobalPayrollLogs);
exports.default = router;
