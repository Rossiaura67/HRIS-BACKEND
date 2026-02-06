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
const subController = __importStar(require("../controllers/subscription.controller"));
const auth_middleware_1 = require("../middlewares/auth.middleware");
const client_1 = require("@prisma/client");
const upload_middleware_1 = __importDefault(require("../middlewares/upload.middleware"));
const router = (0, express_1.Router)();
/**
 * ==========================================
 * ROLE: PUBLIC (WEBHOOK)
 * ==========================================
 */
router.post("/webhook", subController.handlePaymentWebhook);
/**
 * PROTEKSI GLOBAL: Semua rute di bawah wajib login
 */
router.use(auth_middleware_1.authenticate);
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
const adminOnly = (0, auth_middleware_1.authorizeRoles)(client_1.Role.admin);
// Checkout (Mendukung Midtrans & Manual Transfer via multipart/form-data)
router.post("/checkout", adminOnly, upload_middleware_1.default.single("proofOfPayment"), subController.createCheckout);
router.get("/my-history", adminOnly, subController.getTransactionHistory);
router.get("/my-history/:id", adminOnly, subController.getTransactionDetail);
/**
 * ==========================================
 * ROLE: SUPERADMIN ONLY (SYSTEM APPROVAL)
 * ==========================================
 */
router.post("/approve-manual/:transactionId", (0, auth_middleware_1.authorizeRoles)(client_1.Role.superadmin), subController.approveManualPayment);
exports.default = router;
