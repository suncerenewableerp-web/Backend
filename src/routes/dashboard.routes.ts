import express from "express";
import { verifyToken, authorize } from "../middleware/auth.middleware";
import { getDashboard, getTicketTrends, getServicingStatus, getClientDetails } from "../controllers/dashboard.controller";
import { asyncHandler } from "../middleware/error.middleware";

const router = express.Router();

router.use(verifyToken);
router.use(authorize('dashboard', 'view'));

router.get('/', asyncHandler(getDashboard));
router.get('/ticket-trends', asyncHandler(getTicketTrends));
router.get('/servicing-status', asyncHandler(getServicingStatus));
router.get('/client-details', asyncHandler(getClientDetails));

export default router;
