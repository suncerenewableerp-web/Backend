import Ticket from "../models/Ticket.model";
import { asyncHandler } from "../middleware/error.middleware";

function clampInt(v, { min, max, fallback }) {
  const n = Number.parseInt(String(v || ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function monthKey(d) {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function addMonthsUTC(date, deltaMonths) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  d.setUTCMonth(d.getUTCMonth() + deltaMonths);
  return d;
}

function buildTicketVisibilityQuery(user) {
  const roleName = user?.role?.name;
  // ENGINEER is unscoped, matching the tickets list and the dashboard. It used to be
  // narrowed to `assignedTo` alone, which was narrower still than either of those, so an
  // engineer's Reports totals disagreed with both their own dashboard and Admin's.
  if (roleName === 'CUSTOMER') {
    if (user.company) return { 'customer.company': user.company };
    return { 'customer.name': user.name };
  }
  return {};
}

// @desc    Get reports overview
// @route   GET /api/reports
export const getReports = asyncHandler(async (req: any, res: any) => {
  const months = clampInt(req.query?.months, { min: 1, max: 24, fallback: 6 });
  const now = new Date();
  const startMonth = addMonthsUTC(now, -(months - 1));
  const visibilityQuery = buildTicketVisibilityQuery(req.user);

  const matchAll = { ...visibilityQuery };
  const matchRecent = { ...visibilityQuery, createdAt: { $gte: startMonth } };

  const [
    totalTickets,
    closedTickets,
    breachedSLA,
    priorityBreakdownRaw,
    slaBreakdownRaw,
    statusBreakdownRaw,
    monthlyVolumeRaw,
    warrantyAgg,
    resolutionAgg,
  ] = await Promise.all([
    Ticket.countDocuments(matchAll),
    Ticket.countDocuments({ ...matchAll, status: 'CLOSED' }),
    Ticket.countDocuments({ ...matchAll, slaStatus: 'BREACHED' }),
    Ticket.aggregate([
      { $match: matchAll },
      { $group: { _id: '$issue.priority', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    Ticket.aggregate([
      { $match: matchAll },
      { $group: { _id: '$slaStatus', count: { $sum: 1 } } },
    ]),
    Ticket.aggregate([
      { $match: matchAll },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Ticket.aggregate([
      { $match: matchRecent },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Ticket.aggregate([
      { $match: matchAll },
      {
        $project: {
          // Warranty as of the ticket's raise date, not today — the same rule the ticket
          // list and dashboard apply. Measuring against `now` made this breakdown shift on
          // its own as coverage lapsed, and disagree with the per-ticket warranty badges.
          inWarranty: {
            $cond: [
              {
                $and: [
                  { $ifNull: ['$inverter.warrantyEnd', false] },
                  { $gte: ['$inverter.warrantyEnd', '$createdAt'] },
                ],
              },
              1,
              0,
            ],
          },
        },
      },
      {
        $group: {
          _id: null,
          inWarranty: { $sum: '$inWarranty' },
          total: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          inWarranty: 1,
          outOfWarranty: { $subtract: ['$total', '$inWarranty'] },
        },
      },
    ]),
    Ticket.aggregate([
      { $match: { ...matchAll, status: 'CLOSED' } },
      {
        $addFields: {
          closedAt: {
            $let: {
              vars: {
                closedEvents: {
                  $filter: {
                    input: '$statusHistory',
                    as: 'h',
                    cond: { $eq: ['$$h.status', 'CLOSED'] },
                  },
                },
              },
              in: {
                $ifNull: [
                  {
                    $arrayElemAt: [
                      { $map: { input: '$$closedEvents', as: 'e', in: '$$e.changedAt' } },
                      0,
                    ],
                  },
                  '$updatedAt',
                ],
              },
            },
          },
        },
      },
      {
        $addFields: {
          resolutionHours: {
            $divide: [{ $subtract: ['$closedAt', '$createdAt'] }, 1000 * 60 * 60],
          },
        },
      },
      {
        $group: {
          _id: null,
          avgResolutionHours: { $avg: '$resolutionHours' },
        },
      },
      { $project: { _id: 0, avgResolutionHours: 1 } },
    ]),
  ]);

  const priorityBreakdown = (priorityBreakdownRaw || []).map((x) => ({
    priority: String(x?._id || '').toUpperCase() || 'UNKNOWN',
    count: Number(x?.count || 0),
  }));
  const slaBreakdown = Object.fromEntries(
    (slaBreakdownRaw || []).map((x) => [String(x?._id || 'UNKNOWN'), Number(x?.count || 0)]),
  );
  const statusBreakdown = Object.fromEntries(
    (statusBreakdownRaw || []).map((x) => [String(x?._id || 'UNKNOWN'), Number(x?.count || 0)]),
  );

  const monthCounts = Object.fromEntries(
    (monthlyVolumeRaw || []).map((x) => [String(x?._id), Number(x?.count || 0)]),
  );
  const monthlyTicketVolume = [];
  for (let i = 0; i < months; i += 1) {
    const d = addMonthsUTC(startMonth, i);
    const key = monthKey(d);
    monthlyTicketVolume.push({ month: key, count: monthCounts[key] || 0 });
  }

  const warranty = warrantyAgg?.[0] || { inWarranty: 0, outOfWarranty: 0 };
  const avgResolutionHours = resolutionAgg?.[0]?.avgResolutionHours ?? null;

  res.json({
    success: true,
    data: {
      totalTickets,
      closedTickets,
      breachedSLA,
      priorityBreakdown,
      monthlyTicketVolume,
      warranty,
      slaBreakdown,
      statusBreakdown,
      avgResolutionHours,
    },
  });
});
