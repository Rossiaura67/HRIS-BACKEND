import { Router } from "express";
import * as subController from "../controllers/subscription.controller";
import { authenticate, authorizeRoles } from "../middlewares/auth.middleware";
import { Role } from "@prisma/client";
import upload from "../middlewares/upload.middleware";

const router = Router();

/**
 * ==========================================
 * ROLE: PUBLIC (WEBHOOK)
 * ==========================================
 */
router.post("/webhook", subController.handlePaymentWebhook);

/**
 * PROTEKSI GLOBAL: Semua rute di bawah wajib login
 */
router.use(authenticate);

/**
 * ==========================================
 * ROLE: ALL AUTHENTICATED USERS
 * ==========================================
 */
router.get("/plans", subController.getAvailablePlans);
router.get("/my-plan", subController.getMySubscription);

/**
 * ==========================================
 * ROLE: ADMIN ONLY (TENANT BILLING)
 * ==========================================
 */
const adminOnly = authorizeRoles(Role.admin);

// Checkout (Mendukung Midtrans & Manual Transfer via multipart/form-data)
router.post("/checkout", 
    adminOnly, 
    upload.single("proofOfPayment"), 
    subController.createCheckout
);

router.get("/my-history", adminOnly, subController.getTransactionHistory);
router.get("/my-history/:id", adminOnly, subController.getTransactionDetail);

/**
 * ==========================================
 * ROLE: SUPERADMIN ONLY (SYSTEM APPROVAL)
 * ==========================================
 */
router.post("/approve-manual/:transactionId", 
    authorizeRoles(Role.superadmin), 
    subController.approveManualPayment
);

export default router;