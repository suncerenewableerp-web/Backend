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

// @desc    Get SLA overview
// @route   GET /api/sla
export const getSLAOverview = asyncHandler(async (req: any, res: any) => {
  const tickets = await Ticket.find(ticketScopeQuery(req.user)).select('createdAt ticketId slaStatus');
  const stats = {
    total: tickets.length,
    ok: tickets.filter(t => t.slaStatus === 'OK').length,
    warning: tickets.filter(t => t.slaStatus === 'WARNING').length,
    breached: tickets.filter(t => t.slaStatus === 'BREACHED').length
  };
  res.json({ success: true, data: stats });
});
