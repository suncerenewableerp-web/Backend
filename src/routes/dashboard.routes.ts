import express from "express";
import { verifyToken, authorize } from "../middleware/auth.middleware";
import { getDashboard, getTicketTrends } from "../controllers/dashboard.controller";
import { asyncHandler } from "../middleware/error.middleware";

const router = express.Router();

router.use(verifyToken);
router.use(authorize('dashboard', 'view'));

router.get('/', asyncHandler(getDashboard));
router.get('/ticket-trends', asyncHandler(getTicketTrends));

export default router;
