import { Router } from "express";
import * as attendanceController from "../controllers/attendance.controller";
import { authenticate, authorizeRoles } from "../middlewares/auth.middleware";
import { checkSubscription } from "../middlewares/subscription.middleware";
import { Role } from "@prisma/client";
import upload from "../middlewares/upload.middleware";

const router = Router();
const adminAccess = authorizeRoles(Role.admin, Role.superadmin);

router.use(authenticate);

/**
 * ROLE: ALL USERS (SELF-SERVICE)
 */
router.get("/today", attendanceController.getTodayAttendance);
router.get("/my-history", attendanceController.getMyAttendance);
router.post("/check", checkSubscription, upload.single("attendance_photo"), attendanceController.addCheckClock);

/**
 * ROLE: ADMIN 
 */
router.get("/all", adminAccess, attendanceController.getAllAttendance);
router.get("/report", adminAccess, attendanceController.getAttendanceReport);
router.get("/user/:userId", adminAccess, attendanceController.getAttendanceByUser);
router.patch("/update/:id", adminAccess, checkSubscription, attendanceController.updateAttendanceManual);
router.post("/bulk-update", adminAccess, checkSubscription, attendanceController.bulkUpdateAttendance);

export default router;