"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getClientDetails = exports.getServicingStatus = exports.getTicketTrends = exports.getDashboard = void 0;
const Ticket_model_1 = __importDefault(require("../models/Ticket.model"));
const JobCard_model_1 = __importDefault(require("../models/JobCard.model"));
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
function pad2(n) {
    return String(n).padStart(2, "0");
}
function toIntOrNull(v) {
    const n = typeof v === "number" ? v : Number.parseInt(String(v || ""), 10);
    if (!Number.isFinite(n))
        return null;
    return Math.trunc(n);
}
function monthDays(year, month1to12) {
    const d = new Date(Date.UTC(year, month1to12, 0)); // last day of month
    return d.getUTCDate();
}
function tzOffsetIso(tz) {
    // This app primarily uses Asia/Kolkata; keep other tz values on UTC to avoid DST parsing issues.
    const norm = String(tz || "").trim();
    if (norm === "Asia/Kolkata")
        return "+05:30";
    return "Z";
}
function dateStartInTzIso(year, month1, day, tz) {
    const off = tzOffsetIso(tz);
    return new Date(`${year}-${pad2(month1)}-${pad2(day)}T00:00:00.000${off === "Z" ? "Z" : off}`);
}
function formatYmd(d, tz) {
    return formatDayKeyInTz(d, tz);
}
function normalizePeriodKind(raw) {
    const s = String(raw || "").trim().toLowerCase();
    if (s === "fortnightly" || s === "fortnight" || s === "15d" || s === "15days")
        return "FORTNIGHTLY";
    if (s === "monthly" || s === "month")
        return "MONTHLY";
    if (s === "yearly" || s === "year")
        return "YEARLY";
    return "FORTNIGHTLY";
}
function computePeriodWindow(input) {
    const kind = normalizePeriodKind(input.period);
    const now = new Date();
    const tz = input.tz;
    const y = toIntOrNull(input.year) || Number(formatYmd(now, tz).slice(0, 4)) || now.getFullYear();
    const mNow = Number(formatYmd(now, tz).slice(5, 7)) || now.getMonth() + 1;
    const m = Math.min(12, Math.max(1, toIntOrNull(input.month) || mNow));
    const last = monthDays(y, m);
    const f = toIntOrNull(input.fortnight);
    const fort = f === 2 ? 2 : f === 1 ? 1 : Number(formatYmd(now, tz).slice(8, 10)) >= 16 ? 2 : 1;
    if (kind === "YEARLY") {
        const from = dateStartInTzIso(y, 1, 1, tz);
        const toExclusive = dateStartInTzIso(y + 1, 1, 1, tz);
        return { kind, from, toExclusive, fromYmd: `${y}-01-01`, toYmd: `${y}-12-31` };
    }
    if (kind === "MONTHLY") {
        const from = dateStartInTzIso(y, m, 1, tz);
        const toExclusive = m === 12 ? dateStartInTzIso(y + 1, 1, 1, tz) : dateStartInTzIso(y, m + 1, 1, tz);
        return { kind, from, toExclusive, fromYmd: `${y}-${pad2(m)}-01`, toYmd: `${y}-${pad2(m)}-${pad2(last)}` };
    }
    // FORTNIGHTLY
    const fromDay = fort === 1 ? 1 : 16;
    const toDay = fort === 1 ? 15 : last;
    const from = dateStartInTzIso(y, m, fromDay, tz);
    const toExclusive = fort === 1 ? dateStartInTzIso(y, m, 16, tz) : m === 12 ? dateStartInTzIso(y + 1, 1, 1, tz) : dateStartInTzIso(y, m + 1, 1, tz);
    return {
        kind,
        from,
        toExclusive,
        fromYmd: `${y}-${pad2(m)}-${pad2(fromDay)}`,
        toYmd: `${y}-${pad2(m)}-${pad2(toDay)}`,
    };
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
function prefixMongoQuery(q, prefix) {
    if (!q || typeof q !== "object")
        return q;
    if (Array.isArray(q))
        return q.map((x) => prefixMongoQuery(x, prefix));
    const out = {};
    for (const [k, v] of Object.entries(q)) {
        if (k.startsWith("$"))
            out[k] = prefixMongoQuery(v, prefix);
        else
            out[`${prefix}${k}`] = prefixMongoQuery(v, prefix);
    }
    return out;
}
async function aggregateDispatchedByDay(input) {
    const baseMatch = { ...input.scope, statusHistory: { $exists: true, $ne: [] } };
    if (input.clientMatch)
        Object.assign(baseMatch, input.clientMatch);
    const rows = await Ticket_model_1.default.aggregate([
        { $match: baseMatch },
        {
            $addFields: {
                _dispatchDates: {
                    $map: {
                        input: {
                            $filter: {
                                input: "$statusHistory",
                                as: "h",
                                cond: { $eq: ["$$h.status", "DISPATCHED"] },
                            },
                        },
                        as: "c",
                        in: "$$c.changedAt",
                    },
                },
            },
        },
        { $addFields: { dispatchedAt: { $max: "$_dispatchDates" } } },
        { $match: { dispatchedAt: { $type: "date", $gte: input.from, $lt: input.toExclusive } } },
        {
            $group: {
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$dispatchedAt", timezone: input.tz } },
                count: { $sum: 1 },
            },
        },
    ]);
    return rows;
}
async function aggregateJobCardsByDay(input) {
    const rows = await JobCard_model_1.default.aggregate([
        {
            $match: {
                engineerFinalStatus: input.final,
                engineerFinalizedAt: { $type: "date", $gte: input.from, $lt: input.toExclusive },
            },
        },
        {
            $lookup: {
                from: "tickets",
                localField: "ticket",
                foreignField: "_id",
                as: "ticketDoc",
            },
        },
        { $unwind: "$ticketDoc" },
        Object.keys(input.scope || {}).length ? { $match: prefixMongoQuery(input.scope, "ticketDoc.") } : { $match: {} },
        input.clientMatch ? { $match: prefixMongoQuery(input.clientMatch, "ticketDoc.") } : { $match: {} },
        {
            $group: {
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$engineerFinalizedAt", timezone: input.tz } },
                count: { $sum: 1 },
            },
        },
    ]);
    return rows;
}
function toCountMap(rows) {
    const m = new Map();
    (rows || []).forEach((r) => m.set(String(r._id || ""), Number(r.count || 0) || 0));
    return m;
}
function enumerateDays(fromYmd, toYmd) {
    const out = [];
    const start = new Date(`${fromYmd}T00:00:00.000Z`);
    const end = new Date(`${toYmd}T00:00:00.000Z`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()))
        return out;
    for (let t = start.getTime(); t <= end.getTime(); t += 24 * 60 * 60 * 1000) {
        const d = new Date(t);
        out.push(`${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`);
    }
    return out;
}
function normalizeClientKey(rawName, rawAddress) {
    const name = String(rawName || "").trim();
    const address = String(rawAddress || "").trim();
    return { name, address };
}
// @desc    Day-wise created/closed ticket trends
// @route   GET /api/dashboard/ticket-trends?days=14&tz=Asia/Kolkata
exports.getTicketTrends = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const daysRaw = toPositiveInt(req.query?.days);
    const days = Math.min(365, Math.max(7, daysRaw || 14));
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
    const repairedRows = await JobCard_model_1.default.aggregate([
        {
            $match: {
                engineerFinalStatus: "REPAIRABLE",
                engineerFinalizedAt: { $type: "date", $gte: start },
            },
        },
        {
            $lookup: {
                from: "tickets",
                localField: "ticket",
                foreignField: "_id",
                as: "ticketDoc",
            },
        },
        { $unwind: "$ticketDoc" },
        Object.keys(scope || {}).length ? { $match: prefixMongoQuery(scope, "ticketDoc.") } : { $match: {} },
        {
            $group: {
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$engineerFinalizedAt", timezone: tz } },
                count: { $sum: 1 },
            },
        },
    ]);
    const createdMap = new Map();
    (createdRows || []).forEach((r) => createdMap.set(String(r._id || ""), Number(r.count || 0)));
    const closedMap = new Map();
    (closedRows || []).forEach((r) => closedMap.set(String(r._id || ""), Number(r.count || 0)));
    const repairedMap = new Map();
    (repairedRows || []).forEach((r) => repairedMap.set(String(r._id || ""), Number(r.count || 0)));
    const series = [];
    for (let i = days - 1; i >= 0; i -= 1) {
        const key = formatDayKeyInTz(new Date(Date.now() - i * 24 * 60 * 60 * 1000), tz);
        series.push({
            date: key,
            created: createdMap.get(key) || 0,
            closed: closedMap.get(key) || 0,
            repaired: repairedMap.get(key) || 0,
        });
    }
    res.json({ success: true, data: { days, tz, series } });
});
// @desc    Servicing status (received/repaired/scrap/dispatched) for a period + daily breakdown
// @route   GET /api/dashboard/servicing-status?period=fortnightly|monthly|yearly&year=2026&month=5&fortnight=1&tz=Asia/Kolkata
exports.getServicingStatus = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const tz = safeTz(req.query?.tz);
    const scope = ticketScopeQuery(req.user);
    const win = computePeriodWindow({
        period: req.query?.period,
        year: req.query?.year,
        month: req.query?.month,
        fortnight: req.query?.fortnight,
        tz,
    });
    const receivedRows = await Ticket_model_1.default.aggregate([
        { $match: { ...scope, createdAt: { $type: "date", $gte: win.from, $lt: win.toExclusive } } },
        {
            $group: {
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: tz } },
                count: { $sum: 1 },
            },
        },
    ]);
    const repairedRows = await aggregateJobCardsByDay({ scope, from: win.from, toExclusive: win.toExclusive, tz, final: "REPAIRABLE" });
    const scrapRows = await aggregateJobCardsByDay({ scope, from: win.from, toExclusive: win.toExclusive, tz, final: "NOT_REPAIRABLE" });
    const dispatchedRows = await aggregateDispatchedByDay({ scope, from: win.from, toExclusive: win.toExclusive, tz });
    const receivedMap = toCountMap(receivedRows);
    const repairedMap = toCountMap(repairedRows);
    const scrapMap = toCountMap(scrapRows);
    const dispatchedMap = toCountMap(dispatchedRows);
    const days = enumerateDays(win.fromYmd, win.toYmd);
    const daily = days.map((date) => ({
        date,
        received: receivedMap.get(date) || 0,
        repaired: repairedMap.get(date) || 0,
        scrap: scrapMap.get(date) || 0,
        dispatched: dispatchedMap.get(date) || 0,
    }));
    const totals = daily.reduce((acc, r) => {
        acc.received += r.received;
        acc.repaired += r.repaired;
        acc.scrap += r.scrap;
        acc.dispatched += r.dispatched;
        return acc;
    }, { received: 0, repaired: 0, scrap: 0, dispatched: 0 });
    res.json({
        success: true,
        data: {
            period: { kind: win.kind, from: win.fromYmd, to: win.toYmd, tz },
            totals,
            daily,
        },
    });
});
// @desc    Client details (grouped summary) OR daily breakdown for a client within a period
// @route   GET /api/dashboard/client-details?period=...&clientName=...&clientAddress=...&tz=Asia/Kolkata
exports.getClientDetails = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const tz = safeTz(req.query?.tz);
    const scope = ticketScopeQuery(req.user);
    const win = computePeriodWindow({
        period: req.query?.period,
        year: req.query?.year,
        month: req.query?.month,
        fortnight: req.query?.fortnight,
        tz,
    });
    const clientName = String(req.query?.clientName || "").trim();
    const clientAddress = String(req.query?.clientAddress || "").trim();
    const hasClient = Boolean(clientName || clientAddress);
    const clientMatch = hasClient
        ? {
            ...(clientName
                ? {
                    $or: [{ "customer.company": clientName }, { "customer.name": clientName }],
                }
                : {}),
            ...(clientAddress ? { "customer.address": clientAddress } : {}),
        }
        : null;
    if (hasClient) {
        const receivedRows = await Ticket_model_1.default.aggregate([
            { $match: { ...scope, ...(clientMatch || {}), createdAt: { $type: "date", $gte: win.from, $lt: win.toExclusive } } },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: tz } },
                    count: { $sum: 1 },
                },
            },
        ]);
        const repairedRows = await aggregateJobCardsByDay({ scope, from: win.from, toExclusive: win.toExclusive, tz, final: "REPAIRABLE", clientMatch });
        const scrapRows = await aggregateJobCardsByDay({ scope, from: win.from, toExclusive: win.toExclusive, tz, final: "NOT_REPAIRABLE", clientMatch });
        const dispatchedRows = await aggregateDispatchedByDay({ scope, from: win.from, toExclusive: win.toExclusive, tz, clientMatch });
        const receivedMap = toCountMap(receivedRows);
        const repairedMap = toCountMap(repairedRows);
        const scrapMap = toCountMap(scrapRows);
        const dispatchedMap = toCountMap(dispatchedRows);
        const days = enumerateDays(win.fromYmd, win.toYmd);
        const daily = days.map((date) => ({
            date,
            received: receivedMap.get(date) || 0,
            repaired: repairedMap.get(date) || 0,
            scrap: scrapMap.get(date) || 0,
            dispatched: dispatchedMap.get(date) || 0,
        }));
        const totals = daily.reduce((acc, r) => {
            acc.received += r.received;
            acc.repaired += r.repaired;
            acc.scrap += r.scrap;
            acc.dispatched += r.dispatched;
            return acc;
        }, { received: 0, repaired: 0, scrap: 0, dispatched: 0 });
        return res.json({
            success: true,
            data: {
                period: { kind: win.kind, from: win.fromYmd, to: win.toYmd, tz },
                client: normalizeClientKey(clientName, clientAddress),
                totals,
                daily,
            },
        });
    }
    const receivedByClient = await Ticket_model_1.default.aggregate([
        { $match: { ...scope, createdAt: { $type: "date", $gte: win.from, $lt: win.toExclusive } } },
        {
            $group: {
                _id: {
                    name: { $ifNull: ["$customer.company", { $ifNull: ["$customer.name", ""] }] },
                    address: { $ifNull: ["$customer.address", ""] },
                },
                received: { $sum: 1 },
            },
        },
    ]);
    const repairedByClient = await JobCard_model_1.default.aggregate([
        {
            $match: {
                engineerFinalStatus: "REPAIRABLE",
                engineerFinalizedAt: { $type: "date", $gte: win.from, $lt: win.toExclusive },
            },
        },
        {
            $lookup: {
                from: "tickets",
                localField: "ticket",
                foreignField: "_id",
                as: "ticketDoc",
            },
        },
        { $unwind: "$ticketDoc" },
        Object.keys(scope || {}).length ? { $match: prefixMongoQuery(scope, "ticketDoc.") } : { $match: {} },
        {
            $group: {
                _id: {
                    name: { $ifNull: ["$ticketDoc.customer.company", { $ifNull: ["$ticketDoc.customer.name", ""] }] },
                    address: { $ifNull: ["$ticketDoc.customer.address", ""] },
                },
                repaired: { $sum: 1 },
            },
        },
    ]);
    const scrapByClient = await JobCard_model_1.default.aggregate([
        {
            $match: {
                engineerFinalStatus: "NOT_REPAIRABLE",
                engineerFinalizedAt: { $type: "date", $gte: win.from, $lt: win.toExclusive },
            },
        },
        {
            $lookup: {
                from: "tickets",
                localField: "ticket",
                foreignField: "_id",
                as: "ticketDoc",
            },
        },
        { $unwind: "$ticketDoc" },
        Object.keys(scope || {}).length ? { $match: prefixMongoQuery(scope, "ticketDoc.") } : { $match: {} },
        {
            $group: {
                _id: {
                    name: { $ifNull: ["$ticketDoc.customer.company", { $ifNull: ["$ticketDoc.customer.name", ""] }] },
                    address: { $ifNull: ["$ticketDoc.customer.address", ""] },
                },
                scrap: { $sum: 1 },
            },
        },
    ]);
    const dispatchedByClient = await Ticket_model_1.default.aggregate([
        { $match: { ...scope, statusHistory: { $exists: true, $ne: [] } } },
        {
            $addFields: {
                _dispatchDates: {
                    $map: {
                        input: {
                            $filter: {
                                input: "$statusHistory",
                                as: "h",
                                cond: { $eq: ["$$h.status", "DISPATCHED"] },
                            },
                        },
                        as: "c",
                        in: "$$c.changedAt",
                    },
                },
            },
        },
        { $addFields: { dispatchedAt: { $max: "$_dispatchDates" } } },
        { $match: { dispatchedAt: { $type: "date", $gte: win.from, $lt: win.toExclusive } } },
        {
            $group: {
                _id: {
                    name: { $ifNull: ["$customer.company", { $ifNull: ["$customer.name", ""] }] },
                    address: { $ifNull: ["$customer.address", ""] },
                },
                dispatched: { $sum: 1 },
            },
        },
    ]);
    const byKey = new Map();
    const keyOf = (n) => `${String(n?.name || "").trim()}|||${String(n?.address || "").trim()}`;
    (receivedByClient || []).forEach((r) => {
        const k = keyOf(r._id);
        byKey.set(k, { name: String(r._id?.name || "").trim(), address: String(r._id?.address || "").trim(), received: Number(r.received || 0) || 0, repaired: 0, scrap: 0, dispatched: 0 });
    });
    (repairedByClient || []).forEach((r) => {
        const k = keyOf(r._id);
        const cur = byKey.get(k) || { name: String(r._id?.name || "").trim(), address: String(r._id?.address || "").trim(), received: 0, repaired: 0, scrap: 0, dispatched: 0 };
        cur.repaired = Number(r.repaired || 0) || 0;
        byKey.set(k, cur);
    });
    (scrapByClient || []).forEach((r) => {
        const k = keyOf(r._id);
        const cur = byKey.get(k) || { name: String(r._id?.name || "").trim(), address: String(r._id?.address || "").trim(), received: 0, repaired: 0, scrap: 0, dispatched: 0 };
        cur.scrap = Number(r.scrap || 0) || 0;
        byKey.set(k, cur);
    });
    (dispatchedByClient || []).forEach((r) => {
        const k = keyOf(r._id);
        const cur = byKey.get(k) || { name: String(r._id?.name || "").trim(), address: String(r._id?.address || "").trim(), received: 0, repaired: 0, scrap: 0, dispatched: 0 };
        cur.dispatched = Number(r.dispatched || 0) || 0;
        byKey.set(k, cur);
    });
    const clients = Array.from(byKey.values())
        .filter((c) => c.name || c.address)
        .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
    res.json({
        success: true,
        data: {
            period: { kind: win.kind, from: win.fromYmd, to: win.toYmd, tz },
            clients,
        },
    });
});
