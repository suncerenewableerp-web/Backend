import express from "express";
import { verifyToken, authorize } from "../middleware/auth.middleware";
import { dispatchProofUpload } from "../middleware/upload.middleware";
import {
  getLogistics,
  createLogistics,
  updateTracking,
  schedulePickup,
  saveUnderDispatch,
  approveDispatch,
  uploadUnderDispatchProof,
  rejectDispatch,
  scheduleDispatch,
  getLogisticsByTicket,
  getPendingDispatchApprovals,
  getApprovedDispatchApprovals,
} from "../controllers/logistics.controller";
import { asyncHandler } from "../middleware/error.middleware";

const router = express.Router();

router.use(verifyToken);

router.get('/', authorize('logistics', 'view'), asyncHandler(getLogistics));
router.post('/', authorize('logistics', 'create'), asyncHandler(createLogistics));
router.post('/schedule-pickup', authorize('logistics', 'edit'), asyncHandler(schedulePickup));
router.post('/under-dispatch', authorize('logistics', 'edit'), asyncHandler(saveUnderDispatch));
router.post(
  '/under-dispatch-proof',
  authorize('logistics', 'edit'),
  dispatchProofUpload.single("file"),
  asyncHandler(uploadUnderDispatchProof),
);
router.post('/approve-dispatch', authorize('logistics', 'edit'), asyncHandler(approveDispatch));
router.post('/reject-dispatch', authorize('logistics', 'edit'), asyncHandler(rejectDispatch));
router.post('/schedule-dispatch', authorize('logistics', 'edit'), asyncHandler(scheduleDispatch));
router.get('/pending-dispatch-approvals', authorize('logistics', 'view'), asyncHandler(getPendingDispatchApprovals));
router.get('/approved-dispatch-approvals', authorize('logistics', 'view'), asyncHandler(getApprovedDispatchApprovals));
router.put('/:id', authorize('logistics', 'edit'), asyncHandler(updateTracking));
router.get('/ticket/:ticketId', authorize('logistics', 'view'), asyncHandler(getLogisticsByTicket));

export default router;
