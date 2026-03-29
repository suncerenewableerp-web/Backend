import express from "express";
import { verifyToken, authorize } from "../middleware/auth.middleware";
import { getSLAOverview } from "../controllers/sla.controller";
import { asyncHandler } from "../middleware/error.middleware";

const router = express.Router();

router.use(verifyToken);

router.get('/', authorize('sla', 'view'), asyncHandler(getSLAOverview));
// router.post('/recalculate', adminOnly, asyncHandler(recalculateSLA));

export default router;
