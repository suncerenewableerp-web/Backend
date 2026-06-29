/**
 * One-time historical ticket import from an Excel (.xlsx) file.
 *
 * USAGE:
 *   # Dry run (NO database writes) — prints the full report so you can review it:
 *   npx ts-node src/scripts/importTickets.ts ./import/tickets.xlsx
 *
 *   # Actually insert (only after the dry run looks correct):
 *   npx ts-node src/scripts/importTickets.ts ./import/tickets.xlsx --commit
 *
 * SAFETY GUARANTEES:
 *   - ONLY inserts new tickets. Never updates or deletes any existing record.
 *   - Existing IDs / relationships are untouched.
 *   - Duplicates (already-imported rows) are detected and skipped.
 *   - Inserts run inside a transaction (when the MongoDB deployment supports it)
 *     and roll back on a fatal error.
 *   - Default mode is DRY RUN; nothing is written without the --commit flag.
 *
 * Columns that have no native ERP field (LR No, Date Repaired, Date Dispatched)
 * are preserved inside the initial statusHistory[].notes — no schema change.
 */
import mongoose from "mongoose";
import "dotenv/config";
import * as path from "path";
import * as fs from "fs";
import * as XLSX from "xlsx";
import Ticket from "../models/Ticket.model";

// ───────────────────────── Column header aliases ─────────────────────────
// Matched case-insensitively and ignoring spaces/punctuation, so small header
// typos ("LOACTION") or spacing differences still resolve.
const FIELD_ALIASES: Record<string, string[]> = {
  ticketDate: ["TICKET DATE", "TICKETDATE", "DATE"],
  company: ["COMPANY NAME", "COMPANY"],
  raisedBy: ["COMPLAINT RAISED BY", "RAISED BY", "CONTACT PERSON"],
  brand: ["BRAND NAME", "BRAND", "MAKE"],
  model: ["MODEL", "MODEL NAME"],
  capacity: ["CAPACITY", "KW", "RATING"],
  serial: ["SERIAL NUMBER", "SERIAL NO", "SERIALNO", "SR NO", "SERIAL"],
  location: ["INVERTER LOCATION", "INVERTER LOACTION", "LOCATION", "ADDRESS", "SITE"],
  fault: ["FAULT DESCRIPTION", "FAULT", "COMPLAINT", "ISSUE"],
  phone: ["CUSTOMER PHONE NUMBER", "PHONE", "MOBILE", "MOBILE NUMBER", "CONTACT NUMBER"],
  status: ["FINAL STATUS", "STATUS", "TICKET STATUS"],
  lrNo: ["LR NO.", "LR NO", "LRNO", "LR NUMBER", "LR"],
  dateRepaired: ["DATE REPAIRED", "REPAIRED DATE", "REPAIR DATE"],
  dateDispatched: ["DATE DISPATCHED", "DISPATCHED DATE", "DISPATCH DATE"],
};

// Excel "FINAL STATUS" → closest ERP ticket status enum.
// The EXACT original text is also preserved in statusHistory notes, so no detail is lost.
const STATUS_MAP: Record<string, string> = {
  // Inward
  "RECEIVED AT SITE": "RECEIVED",
  RECEIVED: "RECEIVED",
  CREATED: "CREATED",
  PENDING: "CREATED",
  "PICKUP SCHEDULED": "PICKUP_SCHEDULED",
  "IN TRANSIT": "IN_TRANSIT",
  // Under progress / repair
  "UNDER REPAIR": "UNDER_REPAIRED",
  "UNDER REPAIRED": "UNDER_REPAIRED",
  "UNDER WORKING": "UNDER_REPAIRED",
  "IN PROGRESS": "UNDER_REPAIRED",
  "SERVICE VISIT": "UNDER_REPAIRED",
  // Outward / dispatch
  "READY TO DISPATCH": "UNDER_DISPATCH",
  "UNDER DISPATCH": "UNDER_DISPATCH",
  "UNDER DISPATCHED": "UNDER_DISPATCH",
  DISPATCHED: "DISPATCHED",
  // Terminal / closed
  CLOSED: "CLOSED",
  COMPLETED: "CLOSED",
  RESOLVED: "CLOSED",
  "ONSITE REPAIRED": "CLOSED",
  "RETURNED WITHOUT REPAIR": "CLOSED",
  "NOT REPAIRABLE": "CLOSED",
  SOLD: "CLOSED",
  "PURCHASED BY SUNCE": "CLOSED",
  DISMANTLED: "CLOSED",
};

// Excel statuses that imply an on-site service visit.
const ONSITE_STATUSES = new Set(["ONSITE REPAIRED", "SERVICE VISIT"]);

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

const BATCH_SIZE = 200;

// ───────────────────────── Helpers ─────────────────────────
const normKey = (s: string) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

function buildHeaderResolver(headerRow: string[]): Record<string, string> {
  // logical field → actual header string present in the sheet
  const out: Record<string, string> = {};
  const present = new Map<string, string>();
  headerRow.forEach((h) => present.set(normKey(h), h));
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const alias of aliases) {
      const hit = present.get(normKey(alias));
      if (hit) { out[field] = hit; break; }
    }
  }
  return out;
}

function clean(v: any): string {
  if (v == null) return "";
  return String(v).replace(/\s+/g, " ").trim();
}

function parseDate(v: any): Date | null {
  if (v == null || v === "") return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v;
  const s = clean(v);
  if (!s) return null;
  // "7-Feb-2026", "21-Jan-26", "7 Feb 2026", "7/Feb/26"
  const m = s.match(/^(\d{1,2})[-/\s]([A-Za-z]{3,})[-/\s](\d{2,4})$/);
  if (m) {
    const day = parseInt(m[1], 10);
    const mon = MONTHS[m[2].slice(0, 3).toLowerCase()];
    let year = parseInt(m[3], 10);
    if (year < 100) year += 2000;
    if (mon != null && day >= 1 && day <= 31) return new Date(Date.UTC(year, mon, day));
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

const fmtDate = (d: Date | null) =>
  d ? `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}` : "";

// Stable natural key used to detect duplicates (within the file and vs the DB).
function compositeKey(parts: { serial: string; company: string; date: Date | null; model: string; capacity: string; lr: string }): string {
  return [
    normKey(parts.serial),
    normKey(parts.company),
    fmtDate(parts.date),
    normKey(parts.model),
    normKey(parts.capacity),
    normKey(parts.lr),
  ].join("|");
}

function makeTicketIdFactory(existingIds: Set<string>) {
  // Continue the SR-YYYY-#### family. Per year we start past the highest
  // existing numeric suffix to guarantee uniqueness even for thousands of rows.
  const nextByYear = new Map<number, number>();
  for (const id of existingIds) {
    const m = String(id).match(/^SR-(\d{4})-(\d+)$/);
    if (m) {
      const y = parseInt(m[1], 10);
      const n = parseInt(m[2], 10);
      nextByYear.set(y, Math.max(nextByYear.get(y) || 0, n));
    }
  }
  return (year: number): string => {
    let n = (nextByYear.get(year) || 0) + 1;
    let id = `SR-${year}-${String(n).padStart(4, "0")}`;
    while (existingIds.has(id)) {
      n += 1;
      id = `SR-${year}-${String(n).padStart(4, "0")}`;
    }
    nextByYear.set(year, n);
    existingIds.add(id);
    return id;
  };
}

// ───────────────────────── Main ─────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const commit = args.includes("--commit");
  const fileArg = args.find((a) => !a.startsWith("--")) || "./import/tickets.xlsx";
  const filePath = path.resolve(process.cwd(), fileArg);

  if (!fs.existsSync(filePath)) {
    console.error(`❌ Excel file not found: ${filePath}`);
    console.error(`   Place your file there or pass a path, e.g.:`);
    console.error(`   npx ts-node src/scripts/importTickets.ts ./import/tickets.xlsx`);
    process.exit(1);
  }

  console.log(`\n📄 Reading: ${filePath}`);
  console.log(commit ? "🟢 MODE: COMMIT (will insert new tickets)" : "🟡 MODE: DRY RUN (no database writes)\n");

  const wb = XLSX.readFile(filePath, { cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const matrix: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false, blankrows: false });
  if (!matrix.length) { console.error("❌ Sheet is empty."); process.exit(1); }

  const headerRow = (matrix[0] as any[]).map((h) => clean(h));
  const resolver = buildHeaderResolver(headerRow);
  const missing = ["company", "status"].filter((f) => !resolver[f]);
  if (missing.length) {
    console.error(`❌ Could not find required column(s): ${missing.join(", ")}`);
    console.error(`   Headers found: ${headerRow.join(" | ")}`);
    process.exit(1);
  }
  console.log("🔗 Column mapping:");
  for (const [field, header] of Object.entries(resolver)) console.log(`   ${field.padEnd(15)} ← "${header}"`);
  const dataRows = matrix.slice(1);
  console.log(`\n🔢 Data rows: ${dataRows.length}`);

  const cellOf = (row: any[], field: string): any => {
    const header = resolver[field];
    if (!header) return "";
    const idx = headerRow.indexOf(header);
    return idx >= 0 ? row[idx] : "";
  };

  // Preload existing tickets for dedup + ticketId uniqueness (read-only).
  await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/sunce_erp");
  console.log("✅ Connected to MongoDB (read-only scan for duplicates)…");

  const existingIds = new Set<string>();
  const existingKeys = new Set<string>();
  const cursor = Ticket.find({}, { ticketId: 1, "inverter.serialNo": 1, "inverter.model": 1, "inverter.capacity": 1, "customer.company": 1, createdAt: 1 }).lean().cursor();
  for await (const t of cursor as any) {
    if (t?.ticketId) existingIds.add(String(t.ticketId));
    existingKeys.add(compositeKey({
      serial: t?.inverter?.serialNo || "",
      company: t?.customer?.company || "",
      date: t?.createdAt ? new Date(t.createdAt) : null,
      model: t?.inverter?.model || "",
      capacity: t?.inverter?.capacity || "",
      lr: "",
    }));
  }
  console.log(`   Existing tickets in DB: ${existingIds.size}`);
  const nextTicketId = makeTicketIdFactory(existingIds);

  const report = {
    total: dataRows.length,
    imported: 0,
    skippedDuplicate: 0,
    skippedEmpty: 0,
    failed: 0,
    warnings: [] as string[],
    skipped: [] as { row: number; reason: string }[],
    errors: [] as { row: number; reason: string }[],
  };

  const seenInFile = new Set<string>();
  const payloads: any[] = [];

  dataRows.forEach((row, i) => {
    const rowNo = i + 2; // 1-based + header
    try {
      const company = clean(cellOf(row, "company"));
      const serial = clean(cellOf(row, "serial"));
      const brand = clean(cellOf(row, "brand"));
      const model = clean(cellOf(row, "model"));
      const capacity = clean(cellOf(row, "capacity"));
      const raisedBy = clean(cellOf(row, "raisedBy"));
      const phone = clean(cellOf(row, "phone"));
      const location = clean(cellOf(row, "location"));
      const fault = clean(cellOf(row, "fault")) || "OFF";
      const lrNo = clean(cellOf(row, "lrNo"));
      const ticketDate = parseDate(cellOf(row, "ticketDate"));
      const dateRepaired = parseDate(cellOf(row, "dateRepaired"));
      const dateDispatched = parseDate(cellOf(row, "dateDispatched"));
      const rawStatus = clean(cellOf(row, "status")).toUpperCase();

      // Empty row guard
      if (!company && !serial && !brand && !model) {
        report.skippedEmpty++;
        return;
      }

      const mappedStatus = STATUS_MAP[rawStatus];
      const status = mappedStatus || "CREATED";
      if (!mappedStatus && rawStatus) {
        report.warnings.push(`Row ${rowNo}: unknown status "${rawStatus}" → defaulted to CREATED`);
      }

      const key = compositeKey({ serial, company, date: ticketDate, model, capacity, lr: lrNo });
      if (seenInFile.has(key) || existingKeys.has(key)) {
        report.skippedDuplicate++;
        report.skipped.push({ row: rowNo, reason: `Duplicate (${company} / ${serial || "no-serial"} / ${fmtDate(ticketDate) || "no-date"})` });
        return;
      }
      seenInFile.add(key);

      const created = ticketDate || new Date();
      const lastActivity = [dateDispatched, dateRepaired, ticketDate].filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0] || created;

      const noteParts: string[] = [];
      // Preserve the EXACT original Excel stage, so nothing is lost in mapping.
      if (rawStatus) noteParts.push(`Stage: ${rawStatus}`);
      if (lrNo) noteParts.push(`LR No: ${lrNo}`);
      if (dateRepaired) noteParts.push(`Repaired: ${fmtDate(dateRepaired)}`);
      if (dateDispatched) noteParts.push(`Dispatched: ${fmtDate(dateDispatched)}`);
      noteParts.push("Imported from Excel (historical)");

      payloads.push({
        ticketId: nextTicketId(created.getUTCFullYear()),
        serviceType: ONSITE_STATUSES.has(rawStatus) ? "ONSITE" : "STANDARD",
        customer: {
          ...(raisedBy ? { name: raisedBy } : {}),
          ...(company ? { company } : {}),
          ...(phone ? { phone } : {}),
          ...(location ? { address: location } : {}),
        },
        inverter: {
          ...(brand ? { make: brand } : {}),
          ...(model ? { model } : {}),
          ...(serial ? { serialNo: serial } : {}),
          ...(capacity ? { capacity } : {}),
        },
        issue: { description: fault, priority: "MEDIUM" },
        status,
        statusHistory: [{ status, changedAt: created, notes: noteParts.join(" | ") }],
        createdAt: created,
        updatedAt: lastActivity,
      });
    } catch (e: any) {
      report.failed++;
      report.errors.push({ row: rowNo, reason: e?.message || String(e) });
    }
  });

  console.log(`\n📊 Parsed: ${payloads.length} new · ${report.skippedDuplicate} duplicate · ${report.skippedEmpty} empty · ${report.failed} parse-failed`);
  if (report.warnings.length) console.log(`⚠️  ${report.warnings.length} warning(s)`);

  if (commit && payloads.length) {
    let session: mongoose.ClientSession | null = null;
    let useTxn = true;
    try {
      session = await mongoose.startSession();
      session.startTransaction();
    } catch {
      useTxn = false;
    }
    try {
      for (let i = 0; i < payloads.length; i += BATCH_SIZE) {
        const batch = payloads.slice(i, i + BATCH_SIZE);
        // `timestamps: false` keeps our historical createdAt/updatedAt instead of "now".
        // (Runtime-supported by Mongoose; cast because it's missing from the TS option type.)
        const opts: any = { ordered: true, timestamps: false };
        if (useTxn && session) opts.session = session;
        await Ticket.insertMany(batch, opts);
        report.imported += batch.length;
        process.stdout.write(`\r   Inserted ${report.imported}/${payloads.length}…`);
      }
      if (useTxn && session) await session.commitTransaction();
      console.log(`\n✅ Inserted ${report.imported} ticket(s).${useTxn ? " (transaction committed)" : " (no transaction support — inserted directly)"}`);
    } catch (e: any) {
      if (useTxn && session) { try { await session.abortTransaction(); } catch {} }
      console.error(`\n❌ Fatal error during insert — ${useTxn ? "transaction rolled back, nothing was saved" : "partial insert may have occurred"}: ${e?.message || e}`);
      report.errors.push({ row: -1, reason: `Insert failed: ${e?.message || e}` });
      report.imported = useTxn ? 0 : report.imported;
    } finally {
      if (session) await session.endSession();
    }
  } else if (!commit) {
    console.log(`\n🟡 DRY RUN complete — no data written. Re-run with --commit to insert.`);
  }

  // Write report + error log
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.dirname(filePath);
  const reportPath = path.join(outDir, `import-report-${stamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n🧾 Report written: ${reportPath}`);
  console.log(`   imported=${report.imported} duplicate=${report.skippedDuplicate} empty=${report.skippedEmpty} failed=${report.failed} warnings=${report.warnings.length}`);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (e) => {
  console.error("❌ Import crashed:", e);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
