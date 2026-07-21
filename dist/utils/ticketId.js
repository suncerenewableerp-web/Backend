"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.nextTicketId = nextTicketId;
exports.nextTicketIds = nextTicketIds;
const Counter_model_1 = __importDefault(require("../models/Counter.model"));
const Ticket_model_1 = __importDefault(require("../models/Ticket.model"));
const TICKET_ID_RE = /^SR-(\d{4})-(\d+)$/;
const counterName = (year) => `ticket:${year}`;
const formatTicketId = (year, seq) => `SR-${year}-${String(seq).padStart(4, "0")}`;
// Highest number already used for a year, across both the sequential IDs we
// generate and the legacy random ones. Seeding from this means the first
// generated ID can never collide with a ticket that already exists.
async function highestExistingSeq(year) {
    const rows = await Ticket_model_1.default.find({ ticketId: { $regex: `^SR-${year}-\\d+$` } })
        .select("ticketId")
        .lean();
    let max = 0;
    for (const row of rows) {
        const match = TICKET_ID_RE.exec(String(row?.ticketId || ""));
        if (!match)
            continue;
        const n = Number.parseInt(match[2], 10);
        if (Number.isFinite(n) && n > max)
            max = n;
    }
    return max;
}
// Create the counter for a year if it isn't there yet. $setOnInsert makes this
// idempotent, so concurrent callers can't seed it twice.
async function ensureSeeded(year) {
    const _id = counterName(year);
    const existing = await Counter_model_1.default.findById(_id).lean();
    if (existing)
        return;
    const seed = await highestExistingSeq(year);
    await Counter_model_1.default.updateOne({ _id }, { $setOnInsert: { seq: seed } }, { upsert: true });
}
/**
 * Next sequential ticket ID, e.g. `SR-2026-0042`.
 *
 * Existing tickets keep their IDs; numbering continues from the highest one
 * already in use for that year. The retry loop is a safety net for legacy rows
 * whose IDs don't match the expected shape and so weren't counted when seeding.
 */
async function nextTicketId(now = new Date()) {
    const year = now.getFullYear();
    await ensureSeeded(year);
    for (let attempt = 0; attempt < 25; attempt++) {
        const updated = await Counter_model_1.default.findByIdAndUpdate(counterName(year), { $inc: { seq: 1 } }, { new: true, upsert: true }).lean();
        const seq = Number(updated?.seq || 0);
        const candidate = formatTicketId(year, seq);
        const taken = await Ticket_model_1.default.exists({ ticketId: candidate });
        if (!taken)
            return candidate;
    }
    throw new Error(`Could not allocate a ticket ID for ${year} after 25 attempts`);
}
/** Allocate several sequential IDs at once, for bulk creation. */
async function nextTicketIds(count, now = new Date()) {
    const ids = [];
    for (let i = 0; i < count; i++) {
        ids.push(await nextTicketId(now));
    }
    return ids;
}
