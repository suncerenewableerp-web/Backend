const express = require('express');
const { verifyToken, authorize } = require('../middleware/auth.middleware');
const { getTickets, createTicket, getTicket, updateTicket } = require('../controllers/ticket.controller');
const { asyncHandler } = require('../middleware/error.middleware');
const { validate, validateTicketId } = require('../middleware/validate.middleware');

const router = express.Router();

router.use(verifyToken);

router.get('/', authorize('tickets', 'view'), asyncHandler(getTickets));
router.post('/', authorize('tickets', 'create'), asyncHandler(createTicket));
router.get('/:id', verifyToken, validate([validateTicketId]), asyncHandler(getTicket));
router.put('/:id', authorize('tickets', 'edit'), validate([validateTicketId]), asyncHandler(updateTicket));
router.patch('/:id/assign', authorize('tickets', 'edit'), asyncHandler((req, res) => res.json({ success: true, message: 'Assigned' }))); // Stub

router.get('/:id/history', verifyToken, asyncHandler((req, res) => {
  // History logic
  res.json({ success: true, data: [] });
}));

module.exports = router;

