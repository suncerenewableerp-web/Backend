# Historical Ticket Import

Imports historical tickets from an Excel (`.xlsx`) file into the ERP.
**Only inserts new tickets — never updates or deletes existing data.**

## Steps

1. Put your Excel file here, e.g. `Backend/import/tickets.xlsx`.
   - Make sure the **SERIAL NUMBER** column is formatted as **Text** in Excel
     (otherwise Excel mangles long serials into `1.10462E+14`).

2. **Dry run first** (reads the file + DB, writes NOTHING, prints a full report):
   ```bash
   cd Backend
   npm run import:tickets -- ./import/tickets.xlsx
   ```
   Review the printed summary and the generated `import-report-*.json`.

3. **Commit** (only when the dry run looks correct):
   ```bash
   npm run import:tickets -- ./import/tickets.xlsx --commit
   ```

> Tip: run the commit against a **database backup / staging copy first** if possible.

## Column mapping

| Excel column            | ERP field                                   |
| ----------------------- | ------------------------------------------- |
| TICKET DATE             | `createdAt` + first `statusHistory.changedAt` |
| COMPANY NAME            | `customer.company`                          |
| COMPLAINT RAISED BY     | `customer.name`                             |
| CUSTOMER PHONE NUMBER   | `customer.phone` (Mobile Number)            |
| INVERTER LOCATION       | `customer.address`                          |
| BRAND NAME              | `inverter.make`                             |
| MODEL                   | `inverter.model`                            |
| CAPACITY                | `inverter.capacity`                         |
| SERIAL NUMBER           | `inverter.serialNo`                         |
| FAULT DESCRIPTION       | `issue.description` (defaults to `OFF`)     |
| FINAL STATUS            | `status` (see mapping below)                |
| LR NO. / DATE REPAIRED / DATE DISPATCHED | preserved in `statusHistory[0].notes` |

### Status mapping
| Excel FINAL STATUS | ERP status        |
| ------------------ | ----------------- |
| CLOSED / COMPLETED | `CLOSED`          |
| UNDER REPAIR       | `UNDER_REPAIRED`  |
| UNDER DISPATCH     | `UNDER_DISPATCH`  |
| DISPATCHED         | `DISPATCHED`      |
| (anything unknown) | `CREATED` (flagged in report) |

## Safety

- New `ticketId`s are generated as `SR-YYYY-####`, continuing past existing numbers.
- Duplicate rows (same serial + company + date + model + capacity) are **skipped**,
  both within the file and against tickets already in the DB (safe to re-run).
- Inserts run inside a **transaction** when the MongoDB deployment supports it,
  and **roll back** on a fatal error. Otherwise rows are inserted in batches.
- Header matching is tolerant of case, spacing and small typos.
