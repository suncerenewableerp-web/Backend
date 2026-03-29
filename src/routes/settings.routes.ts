import express from "express";
import { verifyToken, authorize } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/error.middleware";
import { getSlaSettings, updateSlaSettings } from "../controllers/settings.controller";

const router = express.Router();

router.use(verifyToken);

router.get('/sla', authorize('sla', 'view'), asyncHandler(getSlaSettings));
router.put('/sla', authorize('sla', 'edit'), asyncHandler(updateSlaSettings));

export default router;
