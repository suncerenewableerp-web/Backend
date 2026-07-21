import Counter from "../models/Counter.model";
import Ticket from "../models/Ticket.model";

const TICKET_ID_RE = /^SR-(\d{4})-(\d+)$/;

const counterName = (year: number) => `ticket:${year}`;

const formatTicketId = (year: number, seq: number) =>
  `SR-${year}-${String(seq).padStart(4, "0")}`;

// Highest number already used for a year, across both the sequential IDs we
// generate and the legacy random ones. Seeding from this means the first
// generated ID can never collide with a ticket that already exists.
async function highestExistingSeq(year: number): Promise<number> {
  const rows = await Ticket.find({ ticketId: { $regex: `^SR-${year}-\\d+$` } })
    .select("ticketId")
    .lean();

  let max = 0;
  for (const row of rows) {
    const match = TICKET_ID_RE.exec(String((row as any)?.ticketId || ""));
    if (!match) continue;
    const n = Number.parseInt(match[2], 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

// Create the counter for a year if it isn't there yet. $setOnInsert makes this
// idempotent, so concurrent callers can't seed it twice.
async function ensureSeeded(year: number): Promise<void> {
  const _id = counterName(year);
  const existing = await Counter.findById(_id).lean();
  if (existing) return;

  const seed = await highestExistingSeq(year);
  await Counter.updateOne({ _id }, { $setOnInsert: { seq: seed } }, { upsert: true });
}

/**
 * Next sequential ticket ID, e.g. `SR-2026-0042`.
 *
 * Existing tickets keep their IDs; numbering continues from the highest one
 * already in use for that year. The retry loop is a safety net for legacy rows
 * whose IDs don't match the expected shape and so weren't counted when seeding.
 */
export async function nextTicketId(now: Date = new Date()): Promise<string> {
  const year = now.getFullYear();
  await ensureSeeded(year);

  for (let attempt = 0; attempt < 25; attempt++) {
    const updated = await Counter.findByIdAndUpdate(
      counterName(year),
      { $inc: { seq: 1 } },
      { new: true, upsert: true },
    ).lean();

    const seq = Number((updated as any)?.seq || 0);
    const candidate = formatTicketId(year, seq);

    const taken = await Ticket.exists({ ticketId: candidate });
    if (!taken) return candidate;
  }

  throw new Error(`Could not allocate a ticket ID for ${year} after 25 attempts`);
}

/** Allocate several sequential IDs at once, for bulk creation. */
export async function nextTicketIds(count: number, now: Date = new Date()): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    ids.push(await nextTicketId(now));
  }
  return ids;
}
