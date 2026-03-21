const Ticket = require('../models/Ticket.model');
const { asyncHandler } = require('../middleware/error.middleware');

// @desc    Get reports overview
// @route   GET /api/reports
const getReports = asyncHandler(async (req, res) => {
  const stats = await Promise.all([
    Ticket.countDocuments({ status: 'CLOSED' }),
    Ticket.countDocuments({ slaStatus: 'BREACHED' }),
    Ticket.aggregate([{ $group: { _id: '$issue.priority', count: { $sum: 1 } } }])
  ]);
  
  res.json({ 
    success: true, 
    data: {
      closedTickets: stats[0],
      breachedSLA: stats[1],
      priorityBreakdown: stats[2]
    }
  });
});

module.exports = { getReports };

