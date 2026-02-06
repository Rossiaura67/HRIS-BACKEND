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
const posController = __importStar(require("../controllers/position.controller"));
const auth_middleware_1 = require("../middlewares/auth.middleware");
const subscription_middleware_1 = require("../middlewares/subscription.middleware");
const client_1 = require("@prisma/client");
const router = (0, express_1.Router)();
// Semua rute wajib login
router.use(auth_middleware_1.authenticate);
/**
 * ==========================================
 * 1. RUTE SELF-SERVICE (Semua Role)
 * ==========================================
 */
// Karyawan melihat detail struktur gaji jabatan mereka sendiri
router.get("/my-detail", posController.getMyPositionDetail);
/**
 * ==========================================
 * 2. RUTE MANAJEMEN (Khusus Admin & Superadmin)
 * ==========================================
 */
const adminAccess = (0, auth_middleware_1.authorizeRoles)(client_1.Role.admin, client_1.Role.superadmin);
// Grouping rute berdasarkan path yang sama
router.route("/")
    .get(adminAccess, posController.getAllPositions)
    .post(adminAccess, subscription_middleware_1.checkSubscription, posController.createPosition);
router.route("/:id")
    .get(adminAccess, posController.getPositionById)
    .put(adminAccess, subscription_middleware_1.checkSubscription, posController.updatePosition)
    .delete(adminAccess, subscription_middleware_1.checkSubscription, posController.deletePosition);
exports.default = router;
