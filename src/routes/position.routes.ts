import { Router } from "express";
import * as posController from "../controllers/position.controller";
import { authenticate, authorizeRoles } from "../middlewares/auth.middleware";
import { checkSubscription } from "../middlewares/subscription.middleware";
import { Role } from "@prisma/client";

const router = Router();

// Semua rute wajib login
router.use(authenticate);

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
const adminAccess = authorizeRoles(Role.admin, Role.superadmin);

// Grouping rute berdasarkan path yang sama
router.route("/")
    .get(adminAccess, posController.getAllPositions)
    .post(adminAccess, checkSubscription, posController.createPosition);

router.route("/:id")
    .get(adminAccess, posController.getPositionById)
    .put(adminAccess, checkSubscription, posController.updatePosition)
    .delete(adminAccess, checkSubscription, posController.deletePosition);

export default router;