const Ticket = require('../models/Ticket.model');
const { asyncHandler } = require('../middleware/error.middleware');

// @desc    Dashboard KPIs
// @route   GET /api/dashboard
const getDashboard = asyncHandler(async (req, res) => {
  const pipeline = [
    { $group: { 
      _id: null,
      totalTickets: { $sum: 1 },
      openTickets: { $sum: { $cond: [{ $ne: ['$status', 'CLOSED'] }, 1, 0] } },
      avgResolutionDays: { $avg: { $divide: [{ $subtract: ['$updatedAt', '$createdAt'] }, 86400000] } }
    } },
    { $project: { 
      _id: 0, avgResolutionDays: { $round: ['$avgResolutionDays', 1] }
    } }
  ];
  
  const kpis = await Ticket.aggregate(pipeline);
  res.json({ success: true, data: kpis[0] || {} });
});

module.exports = { getDashboard };

