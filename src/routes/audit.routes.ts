import { Router } from "express";
import { Role } from "@prisma/client";
import * as auditController from "../controllers/audit.controller";
import { authenticate, authorizeRoles } from "../middlewares/auth.middleware";

const router = Router();
router.use(authenticate);

/** 1. LOGS GLOBAL (Khusus Superadmin)
 */
router.get("/system", authorizeRoles(Role.superadmin), auditController.getGlobalAuditLogs);

/** 2. LOGS INTERNAL (Admin & Superadmin)
 */
router.get("/me", authorizeRoles(Role.admin, Role.superadmin), auditController.getCompanyAuditLogs);

export default router;