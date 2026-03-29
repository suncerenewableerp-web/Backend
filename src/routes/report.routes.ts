import express from "express";
import { verifyToken, authorize } from "../middleware/auth.middleware";
import { getReports } from "../controllers/report.controller";
import { asyncHandler } from "../middleware/error.middleware";

const router = express.Router();

router.use(verifyToken);
router.use(authorize('reports', 'view'));

router.get('/', asyncHandler(getReports));
router.get('/export/tickets', asyncHandler((req, res) => {
  res.json({ success: true, message: 'CSV export ready' });
}));

export default router;
