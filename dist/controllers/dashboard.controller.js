"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTicketTrends = exports.getDashboard = void 0;
const Ticket_model_1 = __importDefault(require("../models/Ticket.model"));
const error_middleware_1 = require("../middleware/error.middleware");
function toPositiveInt(v) {
    const n = typeof v === "number" ? v : Number.parseInt(String(v || ""), 10);
    if (!Number.isFinite(n) || n <= 0)
        return null;
    return Math.trunc(n);
}
function ticketScopeQuery(user) {
    const roleName = user?.role?.name;
    if (roleName === "ENGINEER") {
        return { assignedTo: user._id };
    }
    if (roleName === "CUSTOMER") {
        const legacyMatch = user?.phone
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
exports.getDashboard = (0, error_middleware_1.asyncHandler)(async (req, res) => {
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
    const kpis = await Ticket_model_1.default.aggregate(pipeline);
    res.json({ success: true, data: kpis[0] || {} });
});
function safeTz(input) {
    const tz = String(input || "").trim();
    // Keep a safe default; we don’t strictly validate IANA tz names here.
    return tz || "Asia/Kolkata";
}
function formatDayKeyInTz(d, tz) {
    try {
        const parts = new Intl.DateTimeFormat("en-CA", {
            timeZone: tz,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        }).formatToParts(d);
        const y = parts.find((p) => p.type === "year")?.value || "";
        const m = parts.find((p) => p.type === "month")?.value || "";
        const day = parts.find((p) => p.type === "day")?.value || "";
        if (y && m && day)
            return `${y}-${m}-${day}`;
    }
    catch {
        // ignore
    }
    // Fallback (UTC)
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}
// @desc    Day-wise created/closed ticket trends
// @route   GET /api/dashboard/ticket-trends?days=14&tz=Asia/Kolkata
exports.getTicketTrends = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const daysRaw = toPositiveInt(req.query?.days);
    const days = Math.min(90, Math.max(7, daysRaw || 14));
    const tz = safeTz(req.query?.tz);
    // Use a generous start window to avoid timezone edge misses near midnight.
    const start = new Date(Date.now() - (days + 1) * 24 * 60 * 60 * 1000);
    const scope = ticketScopeQuery(req.user);
    const createdRows = await Ticket_model_1.default.aggregate([
        { $match: { ...scope, createdAt: { $gte: start } } },
        {
            $group: {
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: tz } },
                count: { $sum: 1 },
            },
        },
    ]);
    const closedRows = await Ticket_model_1.default.aggregate([
        { $match: { ...scope, statusHistory: { $exists: true, $ne: [] } } },
        {
            $addFields: {
                _closedDates: {
                    $map: {
                        input: {
                            $filter: {
                                input: "$statusHistory",
                                as: "h",
                                cond: { $eq: ["$$h.status", "CLOSED"] },
                            },
                        },
                        as: "c",
                        in: "$$c.changedAt",
                    },
                },
            },
        },
        { $addFields: { closedAt: { $max: "$_closedDates" } } },
        { $match: { closedAt: { $gte: start } } },
        {
            $group: {
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$closedAt", timezone: tz } },
                count: { $sum: 1 },
            },
        },
    ]);
    const createdMap = new Map();
    (createdRows || []).forEach((r) => createdMap.set(String(r._id || ""), Number(r.count || 0)));
    const closedMap = new Map();
    (closedRows || []).forEach((r) => closedMap.set(String(r._id || ""), Number(r.count || 0)));
    const series = [];
    for (let i = days - 1; i >= 0; i -= 1) {
        const key = formatDayKeyInTz(new Date(Date.now() - i * 24 * 60 * 60 * 1000), tz);
        series.push({
            date: key,
            created: createdMap.get(key) || 0,
            closed: closedMap.get(key) || 0,
        });
    }
    res.json({ success: true, data: { days, tz, series } });
});
