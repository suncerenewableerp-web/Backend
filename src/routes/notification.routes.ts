import express from "express";
import { verifyToken } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/error.middleware";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../controllers/notification.controller";

const router = express.Router();

router.use(verifyToken);

router.get("/", asyncHandler(listNotifications));
router.post("/read-all", asyncHandler(markAllNotificationsRead));
router.post("/:id/read", asyncHandler(markNotificationRead));

export default router;

