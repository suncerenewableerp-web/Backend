import express from "express";
import { verifyToken, authorize } from "../middleware/auth.middleware";
import { getLogistics, createLogistics, updateTracking, schedulePickup } from "../controllers/logistics.controller";
import { asyncHandler } from "../middleware/error.middleware";

const router = express.Router();

router.use(verifyToken);

router.get('/', authorize('logistics', 'view'), asyncHandler(getLogistics));
router.post('/', authorize('logistics', 'create'), asyncHandler(createLogistics));
router.post('/schedule-pickup', authorize('logistics', 'edit'), asyncHandler(schedulePickup));
router.put('/:id', authorize('logistics', 'edit'), asyncHandler(updateTracking));
router.get('/ticket/:ticketId', asyncHandler((req, res) => res.json({ success: true, data: [] })));

export default router;
