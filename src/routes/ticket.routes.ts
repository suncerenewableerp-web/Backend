import express from "express";
import { verifyToken, authorize } from "../middleware/auth.middleware";
import {
  getTickets,
  createTicket,
  getTicket,
  updateTicket,
  getTicketPickupDetails,
  upsertTicketPickupDetails,
  uploadTicketPickupDocument,
  getTicketJobCard,
  updateTicketJobCard,
} from "../controllers/ticket.controller";
import { asyncHandler } from "../middleware/error.middleware";
import { validate, validateTicketId } from "../middleware/validate.middleware";
import { pickupDocumentUpload } from "../middleware/upload.middleware";

const router = express.Router();

router.use(verifyToken);

router.get('/', authorize('tickets', 'view'), asyncHandler(getTickets));
router.post('/', authorize('tickets', 'create'), asyncHandler(createTicket));
router.get('/:id/pickup-details', authorize('tickets', 'view'), validate([validateTicketId]), asyncHandler(getTicketPickupDetails));
router.post('/:id/pickup-details', authorize('tickets', 'edit'), validate([validateTicketId]), asyncHandler(upsertTicketPickupDetails));
router.post(
  "/:id/pickup-documents",
  authorize("tickets", "edit"),
  validate([validateTicketId]),
  pickupDocumentUpload.single("file"),
  asyncHandler(uploadTicketPickupDocument),
);
router.get('/:id/jobcard', authorize('jobcard', 'view'), validate([validateTicketId]), asyncHandler(getTicketJobCard));
router.put('/:id/jobcard', authorize('jobcard', 'edit'), validate([validateTicketId]), asyncHandler(updateTicketJobCard));
router.get('/:id', authorize('tickets', 'view'), validate([validateTicketId]), asyncHandler(getTicket));
router.put('/:id', authorize('tickets', 'edit'), validate([validateTicketId]), asyncHandler(updateTicket));
router.patch('/:id/assign', authorize('tickets', 'edit'), asyncHandler((req, res) => res.json({ success: true, message: 'Assigned' }))); // Stub

router.get('/:id/history', authorize('tickets', 'view'), asyncHandler((req, res) => {
  // History logic
  res.json({ success: true, data: [] });
}));

export default router;
