import Ticket from "../models/Ticket.model";
import { asyncHandler } from "../middleware/error.middleware";

function ticketScopeQuery(user: any) {
  const roleName = user?.role?.name;
  if (roleName === "ENGINEER") {
    return { assignedTo: user._id };
  }
  if (roleName === "CUSTOMER") {
    const legacyMatch: Record<string, any> =
      user?.phone
        ? { "customer.phone": user.phone }
        : { "customer.name": user?.name };
    return {
      $or: [
        { createdBy: user._id },
        { createdBy: { $exists: false }, ...legacyMatch },
        { createdBy: null, ...legacyMatch },
      ],
    };
  }
  return {};
}

// @desc    Dashboard KPIs
// @route   GET /api/dashboard
export const getDashboard = asyncHandler(async (req: any, res: any) => {
  const pipeline = [
    { $match: ticketScopeQuery(req.user) },
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
