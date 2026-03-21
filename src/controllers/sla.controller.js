const Ticket = require('../models/Ticket.model');
const { asyncHandler } = require('../middleware/error.middleware');
const { calcSLAStatus } = require('../utils/helpers');

// @desc    Get SLA overview
// @route   GET /api/sla
const getSLAOverview = asyncHandler(async (req, res) => {
  const tickets = await Ticket.find({}).select('createdAt ticketId slaStatus');
  const stats = {
    total: tickets.length,
    ok: tickets.filter(t => t.slaStatus === 'OK').length,
    warning: tickets.filter(t => t.slaStatus === 'WARNING').length,
    breached: tickets.filter(t => t.slaStatus === 'BREACHED').length
  };
  res.json({ success: true, data: stats });
});

module.exports = { getSLAOverview };

