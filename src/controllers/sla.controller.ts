import Ticket from "../models/Ticket.model";
import { asyncHandler } from "../middleware/error.middleware";
import { closedAtOf, computeSlaStatus, loadSlaConfig } from "../utils/sla";

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
  // Computed from each ticket's own priority and elapsed time rather than the
  // stored slaStatus field, which nothing kept up to date.
  const config = await loadSlaConfig();
  const tickets = await Ticket.find(ticketScopeQuery(req.user))
    .select('createdAt updatedAt ticketId status issue.priority statusHistory')
    .lean();

  const stats = { total: tickets.length, ok: 0, warning: 0, breached: 0 };
  for (const t of tickets as any[]) {
    const status = computeSlaStatus({
      createdAt: t.createdAt,
      priority: t?.issue?.priority,
      config,
      closedAt: closedAtOf(t),
    });
    if (status === 'BREACHED') stats.breached += 1;
    else if (status === 'WARNING') stats.warning += 1;
    else stats.ok += 1;
  }

  res.json({ success: true, data: stats });
});
