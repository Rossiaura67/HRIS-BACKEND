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
const express_validator_1 = require("express-validator");
const authController = __importStar(require("../controllers/auth.controller"));
const auth_middleware_1 = require("../middlewares/auth.middleware");
const validate_middleware_1 = require("../middlewares/validate.middleware");
const router = (0, express_1.Router)();
/**
 * 1. SETUP SUPERADMIN (Initial Deployment)
 */
router.post("/setup-superadmin", [
    (0, express_validator_1.body)("name").trim().notEmpty().withMessage("Nama wajib diisi"),
    (0, express_validator_1.body)("email")
        .isEmail().withMessage("Email tidak valid")
        .custom((value) => {
        if (!value.endsWith("@supersuper")) {
            throw new Error("Email Superadmin harus berakhiran @supersuper");
        }
        return true;
    })
        .normalizeEmail(),
    (0, express_validator_1.body)("password").notEmpty().withMessage("Password sistem wajib diisi")
], validate_middleware_1.validate, authController.createInitialSuperadmin);
/**
 * 2. REGISTER TENANT (SaaS Registration)
 */
router.post("/register", [
    (0, express_validator_1.body)("name").trim().notEmpty().withMessage("Nama admin wajib diisi"),
    (0, express_validator_1.body)("email").isEmail().withMessage("Email tidak valid").normalizeEmail(),
    (0, express_validator_1.body)("companyName").trim().notEmpty().withMessage("Nama perusahaan wajib diisi"),
    (0, express_validator_1.body)("password").isLength({ min: 6 }).withMessage("Password minimal 6 karakter")
], validate_middleware_1.validate, authController.register);
/**
 * 3. LOGIN & SSO
 */
router.post("/login", [
    (0, express_validator_1.body)("email")
        // Izinkan domain tanpa titik untuk keperluan testing/internal
        .isEmail({ allow_display_name: false, require_tld: false })
        .withMessage("Email tidak valid")
        .normalizeEmail(),
    (0, express_validator_1.body)("password").notEmpty().withMessage("Password wajib diisi")
], validate_middleware_1.validate, authController.login);
router.post("/google", [
    (0, express_validator_1.body)("idToken").notEmpty().withMessage("Google ID Token wajib dikirim")
], validate_middleware_1.validate, authController.googleLogin);
/**
 * 4. PASSWORD MANAGEMENT
 */
router.post("/forgot-password", [
    (0, express_validator_1.body)("email").isEmail().withMessage("Email tidak valid").normalizeEmail()
], validate_middleware_1.validate, authController.forgotPassword);
router.post("/reset-password/:token", [
    (0, express_validator_1.body)("password").isLength({ min: 6 }).withMessage("Password minimal 6 karakter"),
    (0, express_validator_1.body)("confirmPassword").custom((value, { req }) => {
        if (value !== req.body.password) {
            throw new Error("Konfirmasi password tidak cocok");
        }
        return true;
    })
], validate_middleware_1.validate, authController.resetPassword);
/**
 * 5. PROFILE & SESSION (Protected)
 */
router.get("/me", auth_middleware_1.authenticate, authController.getMe);
router.post("/logout", auth_middleware_1.authenticate, authController.logout);
exports.default = router;
