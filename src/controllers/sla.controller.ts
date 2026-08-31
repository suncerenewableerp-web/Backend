import Ticket from "../models/Ticket.model";
import { asyncHandler } from "../middleware/error.middleware";

async function ticketScopeQuery(user: any) {
  const roleName = user?.role?.name;
  // ENGINEER is unscoped, matching the tickets list and the dashboard. The SLA Monitor tab
  // is on the engineer's nav (the role carries `sla:view`), so scoping it here made that
  // visible tab report a smaller total than Admin's for the same period.
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
  const tickets = await Ticket.find(await ticketScopeQuery(req.user)).select('createdAt ticketId slaStatus');
  const stats = {
    total: tickets.length,
    ok: tickets.filter(t => t.slaStatus === 'OK').length,
    warning: tickets.filter(t => t.slaStatus === 'WARNING').length,
    breached: tickets.filter(t => t.slaStatus === 'BREACHED').length
  };
  res.json({ success: true, data: stats });
});
