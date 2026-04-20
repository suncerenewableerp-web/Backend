import Ticket from "../models/Ticket.model";
import JobCard from "../models/JobCard.model";
import Logistics from "../models/Logistics.model";
import Role from "../models/Role.model";
import User from "../models/User.model";
import { asyncHandler } from "../middleware/error.middleware";
import { getPagination } from "../utils/helpers";
import { cloudinary, ensureCloudinaryConfigured } from "../config/cloudinary";
import { mapCloudinaryDocUrls, toCloudinaryPrivateDownloadUrl } from "../utils/cloudinaryDownloadUrl";
import { sendEmail } from "../utils/email";

const DEFAULT_FINAL_TESTING_ACTIVITIES = [
  { sr: 1, activity: 'Continuity test of AC side', result: '' },
  { sr: 2, activity: 'Continuity test of DC side', result: '' },
  { sr: 3, activity: 'Check all internal cable connections', result: '' },
  { sr: 4, activity: 'Check all card mounting screws', result: '' },
  { sr: 5, activity: 'Check all MC4 connectors', result: '' },
  { sr: 6, activity: 'Check all DC fuse', result: '' },
  { sr: 7, activity: 'Check all DC MPPT input during power testing', result: '' },
  { sr: 8, activity: 'Check and match Sr. No. with body and display', result: '' },
  { sr: 9, activity: 'Check body cover mounting screws', result: '' },
  { sr: 10, activity: 'Cleaning of all filters', result: '' },
  { sr: 11, activity: 'Cleaning of inverter body', result: '' },
];

const AUTO_WARRANTY_SERIAL_PREFIXES = ["SQ050K1411960456"];
const ASSUMED_DISPATCH_LAG_DAYS = 7; // UNDER_DISPATCH → DISPATCHED assumed
// Requirement: warranty end = dispatch date + (6 months + 1 week).
// The system already treats "6 months" as 180 days elsewhere, so we keep it consistent.
const WARRANTY_AFTER_DISPATCH_DAYS = 187; // 180 + 7

function addDays(d: Date, days: number) {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getAutoWarrantyPrefix(serialNo: any): string | null {
  const raw = String(serialNo || "").trim().toUpperCase();
  if (!raw) return null;
  const hit = AUTO_WARRANTY_SERIAL_PREFIXES.find((p) => raw.startsWith(String(p).toUpperCase()));
  return hit || null;
}

function latestStatusChangedAt(statusHistory: any[] | undefined, status: string): Date | null {
  const target = String(status || "").toUpperCase();
  const rows = Array.isArray(statusHistory) ? statusHistory : [];
  let best: Date | null = null;
  for (const r of rows) {
    const s = String(r?.status || "").toUpperCase();
    if (s !== target) continue;
    const d = r?.changedAt ? new Date(r.changedAt) : null;
    if (!d || Number.isNaN(d.getTime())) continue;
    if (!best || d.getTime() > best.getTime()) best = d;
  }
  return best;
}

async function computeAutoWarrantyEnd(prefix: string): Promise<Date | null> {
  const p = String(prefix || "").trim();
  if (!p) return null;

  const prev: any = await Ticket.findOne({
    status: { $in: ["UNDER_DISPATCH", "DISPATCHED", "INSTALLATION_DONE", "CLOSED"] },
    "inverter.serialNo": { $regex: `^${escapeRegExp(p)}`, $options: "i" },
  })
    .select("_id inverter.warrantyEnd statusHistory updatedAt createdAt")
    .sort({ updatedAt: -1, createdAt: -1 })
    .lean();

  if (!prev?._id) return null;

  const existing = prev?.inverter?.warrantyEnd ? new Date(prev.inverter.warrantyEnd) : null;
  if (existing && !Number.isNaN(existing.getTime())) return existing;

  // Prefer explicit dispatch scheduling date if present.
  const prevLog: any = await Logistics.findOne({ ticket: prev._id, type: "DELIVERY" })
    .select("pickupDetails.scheduledDate deliveryDetails.deliveredDate updatedAt createdAt")
    .sort({ updatedAt: -1, createdAt: -1 })
    .lean();
  const scheduledDispatchAt = prevLog?.pickupDetails?.scheduledDate
    ? new Date(prevLog.pickupDetails.scheduledDate)
    : null;
  if (scheduledDispatchAt && !Number.isNaN(scheduledDispatchAt.getTime())) {
    return addDays(scheduledDispatchAt, WARRANTY_AFTER_DISPATCH_DAYS);
  }

  const dispatchedAt = latestStatusChangedAt(prev?.statusHistory, "DISPATCHED");
  const underDispatchAt = latestStatusChangedAt(prev?.statusHistory, "UNDER_DISPATCH");

  const assumedDispatchAt = dispatchedAt
    ? dispatchedAt
    : underDispatchAt
      ? addDays(underDispatchAt, ASSUMED_DISPATCH_LAG_DAYS)
      : prev?.updatedAt
        ? new Date(prev.updatedAt)
        : prev?.createdAt
          ? new Date(prev.createdAt)
          : null;

  if (!assumedDispatchAt || Number.isNaN(assumedDispatchAt.getTime())) return null;
  return addDays(assumedDispatchAt, WARRANTY_AFTER_DISPATCH_DAYS);
}

// @desc    Get all tickets
// @route   GET /api/tickets
export const getTickets = asyncHandler(async (req: any, res: any) => {
  const { page = 1, limit = 20, status, priority, slaStatus, search } = req.query;
  const { skip, limit: lim } = getPagination(page, limit);
  
  const query: Record<string, any> = { 
    ...(status && { status }),
    ...(priority && { 'issue.priority': priority }),
    ...(slaStatus && { slaStatus }),
    ...(search && { $or: [
      { ticketId: { $regex: search, $options: 'i' } },
      { 'customer.name': { $regex: search, $options: 'i' } },
      { 'issue.description': { $regex: search, $options: 'i' } }
    ]})
  };

  // Role-scoped visibility
  const roleName = String(req.user?.role?.name || "").toUpperCase();
  if (roleName === 'ENGINEER') {
    // Engineers should only receive work when Sales/Admin moves it to UNDER_REPAIRED.
    const finalizedRows = await JobCard.find({ engineerFinalizedBy: req.user._id })
      .select("ticket")
      .lean();
    const finalizedTicketIds = Array.from(
      new Set((finalizedRows || []).map((r: any) => String(r?.ticket || "")).filter(Boolean)),
    );

    // NOTE: On-site (offline booking) tickets must be visible only to the assigned engineer.
    const visibilityOr: any[] = [{ status: "UNDER_REPAIRED", serviceType: { $ne: "ONSITE" } }];
    if (finalizedTicketIds.length) visibilityOr.push({ _id: { $in: finalizedTicketIds } });
    visibilityOr.push({ assignedTo: req.user._id });
    const existingSearchOr = query.$or;
    delete query.$or;
    query.$and = [
      { $or: visibilityOr },
      ...(existingSearchOr ? [{ $or: existingSearchOr }] : []),
    ];
  }
  if (roleName === 'CUSTOMER') {
    // Only show tickets raised by this customer.
    // Prefer the explicit `createdBy` link, but keep a safe fallback for legacy rows
    // that predate the field.
    const legacyMatch: Record<string, any> =
      req.user?.phone
        ? { 'customer.phone': req.user.phone }
        : { 'customer.name': req.user.name };
    const visibilityOr = [
      { createdBy: req.user._id },
      { createdBy: { $exists: false }, ...legacyMatch },
      { createdBy: null, ...legacyMatch },
    ];
    const existingSearchOr = query.$or;
    delete query.$or;
    query.$and = [
      { $or: visibilityOr },
      ...(existingSearchOr ? [{ $or: existingSearchOr }] : []),
    ];
  }

  const ticketsQuery = Ticket.find(query)
    .populate('createdBy', 'email name phone')
    .populate('assignedTo', 'name')
    .populate('statusHistory.changedBy', 'name')
    .sort('-createdAt')
    .skip(skip)
    .limit(lim);

  if (roleName === "CUSTOMER") {
    // Customers must never see warranty validity/dates.
    ticketsQuery.select("-inverter.warrantyEnd");
  }

  const tickets = await ticketsQuery;
    
  const total = await Ticket.countDocuments(query);
  
  res.json({
    success: true,
    data: {
      tickets,
      pagination: { total, page: parseInt(page), limit: lim, pages: Math.ceil(total / lim) }
    }
  });
});

function ticketScopeQuery(user) {
  const roleName = String(user?.role?.name || "").toUpperCase();
  if (roleName === 'ENGINEER') {
    // Engineers can always work on the repair stage, and can also access tickets explicitly
    // assigned to them in later stages (dispatch/installation).
    // NOTE: On-site (offline booking) tickets must be visible only to the assigned engineer.
    return {
      $or: [
        { status: "UNDER_REPAIRED", serviceType: { $ne: "ONSITE" } },
        { assignedTo: user._id },
      ],
    };
  }
  if (roleName === 'CUSTOMER') {
    const legacyMatch: Record<string, any> =
      user?.phone
        ? { 'customer.phone': user.phone }
        : { 'customer.name': user?.name };
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

const STATUS_FLOW = [
  'CREATED',
  'PICKUP_SCHEDULED',
  'IN_TRANSIT',
  'UNDER_REPAIRED',
  'UNDER_DISPATCH',
  'DISPATCHED',
  'INSTALLATION_DONE',
  'CLOSED',
];

function normalizeFlowStatus(raw) {
  const s = String(raw || 'CREATED').toUpperCase();
  if (STATUS_FLOW.includes(s)) return s;
  // Legacy backend statuses collapse into "UNDER_REPAIRED"
  if (['RECEIVED', 'DIAGNOSIS', 'REPAIR', 'TESTING'].includes(s)) return 'UNDER_REPAIRED';
  return 'CREATED';
}

function toDateOrNull(v) {
  if (!v) return null;
  const d = new Date(v);
  const t = d.getTime();
  if (Number.isNaN(t)) return null;
  return d;
}

function getInstallationDocs(ticket: any): any[] {
  const docs = ticket && typeof ticket === "object" ? (ticket as any).installation?.documents : null;
  return Array.isArray(docs) ? docs : [];
}

function mapInstallationDocsForResponse(docs: any[]): Array<{
  url: string;
  uploadedAt?: string;
  uploadedBy?: any;
  uploadedByRole?: string;
  originalName?: string;
  mimeType?: string;
  size?: number;
}> {
  return (Array.isArray(docs) ? docs : []).map((d) => {
    const obj =
      d && typeof (d as any)?.toObject === "function"
        ? (d as any).toObject()
        : d && typeof d === "object"
          ? { ...(d as any) }
          : {};
    const url = String((obj as any)?.url || "");
    return {
      ...obj,
      url: url ? toCloudinaryPrivateDownloadUrl(url, { expiresInSeconds: 24 * 60 * 60 }) : url,
    };
  });
}

function applyInstallationApproval(ticket: any, user: any) {
  const roleNorm = String(user?.role?.name || "").toUpperCase();
  ticket.status = "INSTALLATION_DONE";
  (ticket as any).installation = {
    ...(ticket as any).installation,
    approved: true,
    approvedAt: new Date(),
    approvedBy: user?._id,
    approvedByRole: roleNorm,
  };
}

// @desc    Create ticket
// @route   POST /api/tickets
export const createTicket = asyncHandler(async (req: any, res: any) => {
  const roleName = String(req.user?.role?.name || "").toUpperCase();
  const body = { ...(req.body || {}) };

  if (Object.prototype.hasOwnProperty.call(body, "serviceType")) {
    const st = String(body.serviceType || "").trim().toUpperCase();
    if (st === "STANDARD" || st === "ONSITE") body.serviceType = st;
    else delete body.serviceType;
  }

  // Customers must never be able to set/override warranty validity via payload.
  if (roleName === "CUSTOMER") {
    if (body?.inverter && typeof body.inverter === "object") {
      if (Object.prototype.hasOwnProperty.call(body.inverter, "warrantyEnd")) {
        delete body.inverter.warrantyEnd;
      }
    }
  }

  const autoPrefix = getAutoWarrantyPrefix(body?.inverter?.serialNo);
  if (autoPrefix) {
    const hasWarrantyEnd =
      body?.inverter &&
      typeof body.inverter === "object" &&
      Object.prototype.hasOwnProperty.call(body.inverter, "warrantyEnd") &&
      body.inverter.warrantyEnd;

    if (!hasWarrantyEnd) {
      const computed = await computeAutoWarrantyEnd(autoPrefix);
      const fallback = addDays(new Date(), ASSUMED_DISPATCH_LAG_DAYS + WARRANTY_AFTER_DISPATCH_DAYS);
      body.inverter = body.inverter && typeof body.inverter === "object" ? body.inverter : {};
      body.inverter.warrantyEnd = computed || fallback;
    }
  }

  // If a customer raises a ticket, bind it to their identity so they can
  // consistently see it later (and can't spoof another customer).
  if (roleName === 'CUSTOMER') {
    const inputCustomer =
      typeof body.customer === 'object' && body.customer ? body.customer : {};
    body.customer = {
      ...inputCustomer,
      // Customer may raise a complaint on behalf of a person in their org.
      // Default to their account name if not provided.
      name: String(inputCustomer?.name || '').trim() || req.user.name,
      // Default email to the signup email (but don't overwrite if provided).
      ...(inputCustomer?.email ? {} : req.user.email ? { email: req.user.email } : {}),
      // Keep safe defaults for company/phone (but don't overwrite if provided).
      ...(inputCustomer?.company ? {} : req.user.company ? { company: req.user.company } : {}),
      ...(inputCustomer?.phone ? {} : req.user.phone ? { phone: req.user.phone } : {}),
    };
  }

  const ticket = await Ticket.create({
    ...body,
    createdBy: req.user?._id,
    statusHistory: [{ status: 'CREATED', changedBy: req.user._id }]
  });
  
  await ticket.populate('statusHistory.changedBy', 'name');
  const data = ticket.toObject();
  if (roleName === "CUSTOMER") {
    if (data?.inverter && Object.prototype.hasOwnProperty.call(data.inverter, "warrantyEnd")) {
      delete data.inverter.warrantyEnd;
    }
  }
  res.status(201).json({ success: true, data });
});

// @desc    Create multiple tickets (bulk)
// @route   POST /api/tickets/bulk
export const createTicketsBulk = asyncHandler(async (req: any, res: any) => {
  const roleName = String(req.user?.role?.name || "").toUpperCase();
  const raw = req.body?.tickets;

  if (!Array.isArray(raw) || raw.length === 0) {
    return res.status(400).json({ success: false, message: "tickets must be a non-empty array" });
  }

  const maxBulk = 25;
  if (raw.length > maxBulk) {
    return res.status(400).json({
      success: false,
      message: `Too many tickets in one request. Max ${maxBulk}.`,
    });
  }

  const bodies: any[] = raw.map((t: any) => (t && typeof t === "object" ? { ...t } : null));
  if (bodies.some((b) => !b)) {
    return res.status(400).json({ success: false, message: "Each ticket must be an object" });
  }

  for (const body of bodies) {
    if (Object.prototype.hasOwnProperty.call(body, "serviceType")) {
      const st = String(body.serviceType || "").trim().toUpperCase();
      if (st === "STANDARD" || st === "ONSITE") body.serviceType = st;
      else delete body.serviceType;
    }
  }

  const ticketIds = bodies.map((b) => String(b.ticketId || "").trim());
  const missingTicketId = ticketIds.findIndex((id) => !id);
  if (missingTicketId !== -1) {
    return res.status(400).json({
      success: false,
      message: `ticketId is required for each ticket (missing at index ${missingTicketId})`,
    });
  }

  const uniq = new Set(ticketIds);
  if (uniq.size !== ticketIds.length) {
    return res.status(400).json({
      success: false,
      message: "Duplicate ticketId found in request payload",
    });
  }

  const existing = await Ticket.find({ ticketId: { $in: ticketIds } }).select("ticketId").lean();
  if (existing.length) {
    const ids = existing
      .map((r: any) => String(r?.ticketId || "").trim())
      .filter(Boolean)
      .slice(0, 10);
    return res.status(400).json({
      success: false,
      message: `One or more ticketId already exists: ${ids.join(", ")}${existing.length > 10 ? "…" : ""}`,
    });
  }

  // If a customer raises tickets, bind each row to their identity so they can
  // consistently see it later (and can't spoof another customer).
  if (roleName === "CUSTOMER") {
    for (const body of bodies) {
      if (body?.inverter && typeof body.inverter === "object") {
        if (Object.prototype.hasOwnProperty.call(body.inverter, "warrantyEnd")) {
          delete body.inverter.warrantyEnd;
        }
      }

      const inputCustomer =
        typeof body.customer === "object" && body.customer ? body.customer : {};
      body.customer = {
        ...inputCustomer,
        name: String(inputCustomer?.name || "").trim() || req.user.name,
        ...(inputCustomer?.email ? {} : req.user.email ? { email: req.user.email } : {}),
        ...(inputCustomer?.company ? {} : req.user.company ? { company: req.user.company } : {}),
        ...(inputCustomer?.phone ? {} : req.user.phone ? { phone: req.user.phone } : {}),
      };
    }
  }

  const computedWarrantyByPrefix = new Map<string, Date>();
  for (const body of bodies) {
    const prefix = getAutoWarrantyPrefix(body?.inverter?.serialNo);
    if (!prefix) continue;

    const hasWarrantyEnd =
      body?.inverter &&
      typeof body.inverter === "object" &&
      Object.prototype.hasOwnProperty.call(body.inverter, "warrantyEnd") &&
      body.inverter.warrantyEnd;
    if (hasWarrantyEnd) continue;

    let end = computedWarrantyByPrefix.get(prefix);
    if (!end) {
      const computed = await computeAutoWarrantyEnd(prefix);
      end = computed || addDays(new Date(), ASSUMED_DISPATCH_LAG_DAYS + WARRANTY_AFTER_DISPATCH_DAYS);
      computedWarrantyByPrefix.set(prefix, end);
    }

    body.inverter = body.inverter && typeof body.inverter === "object" ? body.inverter : {};
    body.inverter.warrantyEnd = end;
  }

  const payload = bodies.map((body) => ({
    ...body,
    createdBy: req.user?._id,
    statusHistory: [{ status: "CREATED", changedBy: req.user._id }],
  }));

  const created = await Ticket.insertMany(payload, { ordered: true });
  await Ticket.populate(created, { path: "statusHistory.changedBy", select: "name" });

  const tickets = (created || []).map((t: any) => {
    const obj = typeof t?.toObject === "function" ? t.toObject() : t;
    if (roleName === "CUSTOMER") {
      if (obj?.inverter && Object.prototype.hasOwnProperty.call(obj.inverter, "warrantyEnd")) {
        delete obj.inverter.warrantyEnd;
      }
    }
    return obj;
  });

  res.status(201).json({ success: true, data: { tickets } });
});

// @desc    Get single ticket
// @route   GET /api/tickets/:id
export const getTicket = asyncHandler(async (req: any, res: any) => {
  const roleName = String(req.user?.role?.name || "").toUpperCase();
  const scopedQuery = { _id: req.params.id, ...ticketScopeQuery(req.user) };
  const ticketQuery = Ticket.findOne(scopedQuery)
    .populate('createdBy', 'email name phone')
    .populate('assignedTo', 'name')
    .populate('jobCard')
    .populate('logistics')
    .populate('statusHistory.changedBy', 'name');

  if (roleName === "CUSTOMER") {
    // Customers must never see warranty validity/dates.
    ticketQuery.select("-inverter.warrantyEnd");
  }

  let ticket = await ticketQuery;

  // Fallback for legacy rows: allow engineers to view tickets they finalized even if `assignedTo`
  // was not set at that time.
  if (!ticket && roleName === "ENGINEER") {
    const raw = await Ticket.findById(req.params.id).select("jobCard").lean();
    const jobCardId = raw?.jobCard ? String(raw.jobCard) : "";
    if (jobCardId) {
      const jc = await JobCard.findById(jobCardId).select("engineerFinalizedBy").lean();
      if (String(jc?.engineerFinalizedBy || "") === String(req.user?._id || "")) {
        ticket = await Ticket.findById(req.params.id)
          .populate('createdBy', 'email name phone')
          .populate('assignedTo', 'name')
          .populate('jobCard')
          .populate('logistics')
          .populate('statusHistory.changedBy', 'name');
      }
    }
  }

  if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });
  res.json({ success: true, data: ticket });
});

// @desc    Update ticket
// @route   PUT /api/tickets/:id
export const updateTicket = asyncHandler(async (req: any, res: any) => {
  const roleName = req.user?.role?.name;
  const ticket = await Ticket.findOne({ _id: req.params.id, ...ticketScopeQuery(req.user) });
  if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });

  // Extra safety beyond RBAC: enforce *which fields* each role can modify.
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const topKeys = Object.keys(body);
  const roleNorm = String(roleName || "").toUpperCase();
  if (roleNorm === "ENGINEER" && String(ticket.status || "").toUpperCase() === "CLOSED") {
    return res.status(400).json({ success: false, message: "Closed tickets are read-only for engineers." });
  }
  const isTicketAdmin = roleNorm === "ADMIN" || roleNorm === "SALES";
  const ALLOWED_STATUSES = new Set([
    'CREATED',
    'PICKUP_SCHEDULED',
    'IN_TRANSIT',
    'UNDER_REPAIRED',
    'UNDER_DISPATCH',
    'DISPATCHED',
    'INSTALLATION_DONE',
    'CLOSED',
  ]);

  if (Object.prototype.hasOwnProperty.call(body, 'status')) {
    const next = String(body.status || '').toUpperCase();
    if (!ALLOWED_STATUSES.has(next)) {
      return res.status(400).json({ success: false, message: 'Invalid status value' });
    }
    body.status = next;
  }

  if (roleNorm === 'ENGINEER') {
    const allowedTop = new Set(['status']);
    const disallowedTop = topKeys.filter((k) => !allowedTop.has(k));
    if (disallowedTop.length) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: Engineers can only update ticket status.',
      });
    }
  }

  if (!isTicketAdmin && roleNorm !== 'ENGINEER') {
    // Customers and unknown roles should never reach here (RBAC), but keep hard guard.
    return res.status(403).json({ success: false, message: 'Access denied.' });
  }

  const prevStatus = ticket.status;
  const prevFlow = normalizeFlowStatus(prevStatus);
  const isOnsite = String((ticket as any)?.serviceType || "").toUpperCase() === "ONSITE";

  if (Object.prototype.hasOwnProperty.call(body, 'status')) {
    const nextFlow = normalizeFlowStatus(body.status);
    if (isOnsite) {
      const allowed = new Set(["CREATED", "UNDER_REPAIRED", "CLOSED"]);
      if (!allowed.has(nextFlow)) {
        return res.status(400).json({
          success: false,
          message: "Invalid status for on-site (offline booking) tickets.",
        });
      }
      if (prevFlow === "CLOSED" && nextFlow !== "CLOSED") {
        return res.status(400).json({ success: false, message: "Closed tickets cannot be reopened." });
      }
      const order = ["CREATED", "UNDER_REPAIRED", "CLOSED"];
      const prevOrder = order.indexOf(prevFlow);
      const nextOrder = order.indexOf(nextFlow);
      if (nextOrder < prevOrder) {
        return res.status(400).json({ success: false, message: "Status cannot move backwards." });
      }
      if (prevFlow === "CREATED" && nextFlow === "CLOSED") {
        return res.status(400).json({
          success: false,
          message: "Please assign to engineer before closing this offline booking.",
        });
      }
      // On-site tickets intentionally bypass pickup/transit/installation steps and don't require installation docs.
    } else {
      const prevIdx = STATUS_FLOW.indexOf(prevFlow);
      const nextIdx = STATUS_FLOW.indexOf(nextFlow);

      // Business rule: Sales can proceed to DISPATCHED only after Admin approval.
      if (roleNorm === "SALES" && nextFlow === "DISPATCHED") {
        const delivery: any = await Logistics.findOne({ ticket: ticket._id, type: "DELIVERY" })
          .select("billing.dispatchApproved")
          .lean();
        const approved = Boolean(delivery?.billing?.dispatchApproved);
        if (!approved) {
          return res.status(403).json({
            success: false,
            message: "Dispatch requires Admin approval. Please wait for Admin to approve the dispatch request.",
          });
        }
      }

      if (prevFlow === 'CLOSED' && nextFlow !== 'CLOSED') {
        return res.status(400).json({ success: false, message: 'Closed tickets cannot be reopened.' });
      }
      if (nextIdx < prevIdx) {
        return res.status(400).json({ success: false, message: 'Status cannot move backwards.' });
      }
      if (nextIdx > prevIdx + 1) {
        return res.status(400).json({
          success: false,
          message: 'Please follow the workflow step-by-step. Skipping steps is not allowed.',
        });
      }

      // Installation step requires at least one installation PDF to be uploaded first.
      if (nextFlow === "INSTALLATION_DONE") {
        const docsCount = getInstallationDocs(ticket).length;
        if (!docsCount) {
          return res.status(400).json({
            success: false,
            message: "Please upload installation PDF first, then mark installation as done.",
          });
        }
      }

      // Closing is allowed only after installation docs are present.
      if (nextFlow === "CLOSED") {
        const docsCount = getInstallationDocs(ticket).length;
        if (!docsCount) {
          return res.status(400).json({
            success: false,
            message: "Please upload installation PDF before closing the ticket.",
          });
        }
      }
    }
  }

  if (isTicketAdmin) {
    if (Object.prototype.hasOwnProperty.call(body, 'status')) {
      if (String(body.status || "").toUpperCase() === "INSTALLATION_DONE") {
        applyInstallationApproval(ticket, req.user);
      } else {
        ticket.set('status', body.status);
      }
    }
    if (Object.prototype.hasOwnProperty.call(body, 'slaStatus')) ticket.set('slaStatus', body.slaStatus);
    if (Object.prototype.hasOwnProperty.call(body, 'slaTargetDate')) ticket.set('slaTargetDate', body.slaTargetDate);

    if (body.customer && typeof body.customer === 'object') {
      if (Object.prototype.hasOwnProperty.call(body.customer, 'name')) ticket.set('customer.name', body.customer.name);
      if (Object.prototype.hasOwnProperty.call(body.customer, 'phone')) ticket.set('customer.phone', body.customer.phone);
      if (Object.prototype.hasOwnProperty.call(body.customer, 'company')) ticket.set('customer.company', body.customer.company);
      if (Object.prototype.hasOwnProperty.call(body.customer, 'address')) ticket.set('customer.address', body.customer.address);
    }

    if (body.inverter && typeof body.inverter === 'object') {
      if (Object.prototype.hasOwnProperty.call(body.inverter, 'make')) ticket.set('inverter.make', body.inverter.make);
      if (Object.prototype.hasOwnProperty.call(body.inverter, 'model')) ticket.set('inverter.model', body.inverter.model);
      if (Object.prototype.hasOwnProperty.call(body.inverter, 'serialNo')) ticket.set('inverter.serialNo', body.inverter.serialNo);
      if (Object.prototype.hasOwnProperty.call(body.inverter, 'capacity')) ticket.set('inverter.capacity', body.inverter.capacity);
      if (Object.prototype.hasOwnProperty.call(body.inverter, 'installationDate')) ticket.set('inverter.installationDate', body.inverter.installationDate);
      if (Object.prototype.hasOwnProperty.call(body.inverter, 'warrantyEnd')) ticket.set('inverter.warrantyEnd', body.inverter.warrantyEnd);
    }

    if (body.issue && typeof body.issue === 'object') {
      if (Object.prototype.hasOwnProperty.call(body.issue, 'description')) ticket.set('issue.description', body.issue.description);
      if (Object.prototype.hasOwnProperty.call(body.issue, 'errorCode')) ticket.set('issue.errorCode', body.issue.errorCode);
      if (Object.prototype.hasOwnProperty.call(body.issue, 'priority')) ticket.set('issue.priority', body.issue.priority);
      if (Object.prototype.hasOwnProperty.call(body.issue, 'photos')) ticket.set('issue.photos', body.issue.photos);
    }

    if (Object.prototype.hasOwnProperty.call(body, 'assignedTo')) ticket.set('assignedTo', body.assignedTo);
    if (Object.prototype.hasOwnProperty.call(body, 'customerFeedback')) ticket.set('customerFeedback', body.customerFeedback);
    if (Object.prototype.hasOwnProperty.call(body, 'feedbackRating')) ticket.set('feedbackRating', body.feedbackRating);
  }

  if (roleNorm === 'ENGINEER') {
    if (Object.prototype.hasOwnProperty.call(body, 'status')) {
      if (String(body.status || "").toUpperCase() === "INSTALLATION_DONE") {
        applyInstallationApproval(ticket, req.user);
      } else {
        ticket.set('status', body.status);
      }
    }
  }

  if (ticket.status && ticket.status !== prevStatus) {
    ticket.statusHistory.push({
      status: ticket.status,
      changedBy: req.user._id,
    });
  }

  await ticket.save();
  await ticket.populate('createdBy', 'email name phone');
  await ticket.populate('statusHistory.changedBy', 'name');
  await ticket.populate('logistics');
  res.json({ success: true, data: ticket });
});

// @desc    Assign engineer to on-site (offline booking) ticket
// @route   POST /api/tickets/:id/onsite/assign
export const assignOnsiteBooking = asyncHandler(async (req: any, res: any) => {
  const roleNorm = String(req.user?.role?.name || "").toUpperCase();
  if (roleNorm !== "ADMIN" && roleNorm !== "SALES") {
    return res.status(403).json({ success: false, message: "Access denied." });
  }

  const ticket = await Ticket.findById(req.params.id)
    .populate("createdBy", "email name phone")
    .populate("assignedTo", "name")
    .populate("statusHistory.changedBy", "name")
    .populate("logistics");
  if (!ticket) return res.status(404).json({ success: false, message: "Ticket not found" });

  const isOnsite = String((ticket as any)?.serviceType || "").toUpperCase() === "ONSITE";
  if (!isOnsite) {
    return res.status(400).json({ success: false, message: "This ticket is not an on-site (offline booking) ticket." });
  }
  if (String(ticket.status || "").toUpperCase() === "CLOSED") {
    return res.status(400).json({ success: false, message: "Closed tickets cannot be updated." });
  }

  const bodyEngineerId = String(req.body?.engineerId || "").trim();
  const envDefaultEngineerId = String(process.env.ONSITE_DEFAULT_ENGINEER_ID || process.env.DEFAULT_ENGINEER_ID || "").trim();
  const envDefaultEngineerEmail = String(
    process.env.ONSITE_DEFAULT_ENGINEER_EMAIL || process.env.DEFAULT_ENGINEER_EMAIL || "",
  )
    .trim()
    .toLowerCase();

  const findFirstEngineer = async (preferredEmail?: string) => {
    const engineerRole = await Role.findOne({ name: "ENGINEER" }).select("_id").lean();
    if (!engineerRole?._id) return null;
    const baseQuery: any = { role: engineerRole._id, isActive: true };
    if (preferredEmail) baseQuery.email = preferredEmail;
    let u = await User.findOne(baseQuery).sort({ createdAt: 1 }).select("_id").lean();
    if (!u && preferredEmail) {
      u = await User.findOne({ role: engineerRole._id, isActive: true })
        .sort({ createdAt: 1 })
        .select("_id")
        .lean();
    }
    return u;
  };

  const ensureEngineerUserId = async (candidateId: string | null | undefined) => {
    const id = String(candidateId || "").trim();
    if (!id) return null;
    const u: any = await User.findById(id).populate("role", "name");
    const roleName = String(u?.role?.name || "").toUpperCase();
    if (!u?._id || !u?.isActive || roleName !== "ENGINEER") return null;
    return String(u._id);
  };

  let engineerId =
    (await ensureEngineerUserId(bodyEngineerId)) ||
    (await ensureEngineerUserId(envDefaultEngineerId)) ||
    (await (async () => {
      const u = await findFirstEngineer(envDefaultEngineerEmail || undefined);
      return u?._id ? String(u._id) : null;
    })());

  if (!engineerId) {
    return res.status(400).json({
      success: false,
      message:
        "No engineer user found to assign. Create an active ENGINEER user, or set ONSITE_DEFAULT_ENGINEER_ID.",
    });
  }

  const prevStatus = String(ticket.status || "").toUpperCase();
  ticket.set("assignedTo", [engineerId]);
  ticket.set("status", "UNDER_REPAIRED");
  if (prevStatus !== "UNDER_REPAIRED") {
    ticket.statusHistory.push({ status: "UNDER_REPAIRED", changedBy: req.user._id });
  }

  await ticket.save();
  await ticket.populate("assignedTo", "name");
  res.status(200).json({ success: true, data: ticket });
});

// @desc    Save on-site (offline booking) engineer job details and optionally close ticket
// @route   PUT /api/tickets/:id/onsite/jobcard
export const upsertOnsiteJobCard = asyncHandler(async (req: any, res: any) => {
  const roleNorm = String(req.user?.role?.name || "").toUpperCase();
  if (roleNorm !== "ENGINEER") {
    return res.status(403).json({ success: false, message: "Access denied." });
  }

  const ticket = await Ticket.findOne({ _id: req.params.id, assignedTo: req.user._id })
    .populate("createdBy", "email name phone")
    .populate("assignedTo", "name")
    .populate("statusHistory.changedBy", "name")
    .populate("logistics");
  if (!ticket) return res.status(404).json({ success: false, message: "Ticket not found" });

  const isOnsite = String((ticket as any)?.serviceType || "").toUpperCase() === "ONSITE";
  if (!isOnsite) {
    return res.status(400).json({ success: false, message: "This ticket is not an on-site (offline booking) ticket." });
  }

  if (String(ticket.status || "").toUpperCase() === "CLOSED") {
    return res.status(400).json({ success: false, message: "This ticket is already closed." });
  }
  if (String(ticket.status || "").toUpperCase() !== "UNDER_REPAIRED") {
    return res.status(400).json({ success: false, message: "Please ask Sales/Admin to assign this offline booking first." });
  }

  const visitDate = Object.prototype.hasOwnProperty.call(req.body || {}, "visitDate")
    ? toDateOrNull(req.body?.visitDate)
    : null;
  const engineerName = Object.prototype.hasOwnProperty.call(req.body || {}, "engineerName")
    ? String(req.body?.engineerName || "").trim()
    : "";
  const remark = Object.prototype.hasOwnProperty.call(req.body || {}, "remark")
    ? String(req.body?.remark || "").trim()
    : null;
  const markRepaired = Boolean(req.body?.markRepaired);

  (ticket as any).onsite = (ticket as any).onsite || {};
  (ticket as any).onsite.engineerName =
    engineerName || String(req.user?.name || "").trim() || (ticket as any).onsite.engineerName;
  if (visitDate) (ticket as any).onsite.visitDate = visitDate;
  if (remark !== null) (ticket as any).onsite.remark = remark;

  if (markRepaired) {
    (ticket as any).onsite.markedRepairedAt = new Date();
    (ticket as any).onsite.markedRepairedBy = req.user?._id;
    ticket.status = "CLOSED";
    ticket.statusHistory.push({ status: "CLOSED", changedBy: req.user._id });
  }

  await ticket.save();
  res.status(200).json({ success: true, data: ticket });
});

// @desc    Approve installation (moves ticket DISPATCHED -> INSTALLATION_DONE)
// @route   POST /api/tickets/:id/installation-done
export const approveInstallationDone = asyncHandler(async (req: any, res: any) => {
  const roleNorm = String(req.user?.role?.name || "").toUpperCase();
  if (!["CUSTOMER", "SALES", "ADMIN", "ENGINEER"].includes(roleNorm)) {
    return res.status(403).json({ success: false, message: "Access denied." });
  }

  const ticket = await Ticket.findOne({ _id: req.params.id, ...ticketScopeQuery(req.user) })
    .populate("createdBy", "email name phone")
    .populate("assignedTo", "name")
    .populate("statusHistory.changedBy", "name")
    .populate("logistics");
  if (!ticket) return res.status(404).json({ success: false, message: "Ticket not found" });

  if (String(ticket.status || "").toUpperCase() === "CLOSED") {
    return res.status(400).json({ success: false, message: "Closed tickets cannot be updated." });
  }

  const current = normalizeFlowStatus(ticket.status);
  const docsCount = getInstallationDocs(ticket).length;
  if (!docsCount) {
    return res.status(400).json({
      success: false,
      message: "Please upload installation PDF first, then mark installation as done.",
    });
  }

  if (current !== "DISPATCHED" && current !== "INSTALLATION_DONE") {
    return res.status(400).json({
      success: false,
      message: "Installation can be approved only after the ticket is DISPATCHED.",
    });
  }

  const prev = ticket.status;
  const prevFlow = normalizeFlowStatus(prev);
  const nextFlow = "INSTALLATION_DONE";
  const shouldPushHistory = prevFlow !== nextFlow;

  applyInstallationApproval(ticket, req.user);
  if (shouldPushHistory) ticket.statusHistory.push({ status: ticket.status, changedBy: req.user._id });

  await ticket.save();
  await ticket.populate("statusHistory.changedBy", "name");
  res.status(200).json({ success: true, data: ticket });
});

// @desc    Get pickup details for a ticket (customer-friendly)
// @route   GET /api/tickets/:id/pickup-details
export const getTicketPickupDetails = asyncHandler(async (req: any, res: any) => {
  const ticket = await Ticket.findOne({ _id: req.params.id, ...ticketScopeQuery(req.user) });
  if (!ticket) return res.status(404).json({ success: false, message: "Ticket not found" });

  const pickup = await Logistics.findOne({ ticket: ticket._id, type: "PICKUP" }).sort("-updatedAt");
  res.json({
    success: true,
    data: {
      pickupDate: pickup?.pickupDetails?.scheduledDate || null,
      pickupLocation: String(pickup?.pickupDetails?.pickupLocation || ticket.customer?.address || ""),
      documents: mapCloudinaryDocUrls(pickup?.documents, { expiresInSeconds: 24 * 60 * 60 }),
    },
  });
});

// @desc    Upsert pickup details for a ticket (customer input)
// @route   POST /api/tickets/:id/pickup-details
export const upsertTicketPickupDetails = asyncHandler(async (req: any, res: any) => {
  const roleName = String(req.user?.role?.name || "").toUpperCase();
  if (roleName !== "ADMIN" && roleName !== "SALES") {
    return res.status(403).json({ success: false, message: "Access denied." });
  }

  const ticket = await Ticket.findOne({ _id: req.params.id, ...ticketScopeQuery(req.user) });
  if (!ticket) return res.status(404).json({ success: false, message: "Ticket not found" });
  if (String(ticket.status || "").toUpperCase() === "CLOSED") {
    return res.status(400).json({ success: false, message: "Closed tickets cannot be updated." });
  }

  const pickupDate = toDateOrNull(req.body?.pickupDate);
  const pickupLocation = String(req.body?.pickupLocation || "").trim();

  if (!pickupDate) {
    return res.status(400).json({ success: false, message: "pickupDate is required" });
  }
  if (!pickupLocation) {
    return res.status(400).json({ success: false, message: "pickupLocation is required" });
  }

  const s = String(ticket.status || "").toUpperCase();
  if (!["CREATED", "PICKUP_SCHEDULED"].includes(s)) {
    return res.status(400).json({
      success: false,
      message: "Pickup details can be updated only when the ticket is CREATED or PICKUP_SCHEDULED.",
    });
  }

  const pickup = await Logistics.findOneAndUpdate(
    { ticket: ticket._id, type: "PICKUP" },
    {
      $set: {
        type: "PICKUP",
        "pickupDetails.scheduledDate": pickupDate,
        "pickupDetails.pickupLocation": pickupLocation,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true },
  );

  ticket.logistics = pickup._id;

  if (s === "CREATED") {
    ticket.status = "PICKUP_SCHEDULED";
    ticket.statusHistory.push({ status: ticket.status, changedBy: req.user._id });
  }

  await ticket.save();

  res.status(201).json({
    success: true,
    data: {
      pickupDate: pickup.pickupDetails?.scheduledDate || null,
      pickupLocation: String(pickup.pickupDetails?.pickupLocation || ""),
      documents: mapCloudinaryDocUrls(pickup?.documents, { expiresInSeconds: 24 * 60 * 60 }),
    },
  });
});

// @desc    Upload pickup document (PDF/Image) for a ticket
// @route   POST /api/tickets/:id/pickup-documents
export const uploadTicketPickupDocument = asyncHandler(async (req: any, res: any) => {
  const roleName = String(req.user?.role?.name || "").toUpperCase();
  if (!["ADMIN", "SALES"].includes(roleName)) {
    return res.status(403).json({ success: false, message: "Access denied." });
  }

  const ticket = await Ticket.findOne({ _id: req.params.id, ...ticketScopeQuery(req.user) });
  if (!ticket) return res.status(404).json({ success: false, message: "Ticket not found" });

  const file = req.file;
  if (!file || !file.buffer) {
    return res.status(400).json({ success: false, message: "Missing file upload" });
  }

  ensureCloudinaryConfigured();
  const folder = String(process.env.CLOUDINARY_FOLDER || "sunce_erp/pickup").trim() || "sunce_erp/pickup";
  const ticketSeg = String(req.params?.id || "ticket")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .slice(0, 40);
  const stamp = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const publicId = `${ticketSeg}_${stamp}`;

  const uploaded = await new Promise<{ secure_url: string }>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        resource_type: "auto", // supports pdf/images
        access_mode: "public",
      },
      (err, result) => {
        if (err) return reject(err);
        if (!result || !result.secure_url) return reject(new Error("Cloudinary upload failed"));
        resolve({ secure_url: String((result as any).secure_url) });
      },
    );
    stream.end(file.buffer);
  });

  const urlPath = uploaded.secure_url;

  const pickup = await Logistics.findOneAndUpdate(
    { ticket: ticket._id, type: "PICKUP" },
    {
      $setOnInsert: {
        ticket: ticket._id,
        type: "PICKUP",
        status: "SCHEDULED",
      },
      $addToSet: { documents: urlPath },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true },
  );

  ticket.logistics = pickup._id;
  await ticket.save();

  res.status(201).json({
    success: true,
    data: {
      url: toCloudinaryPrivateDownloadUrl(urlPath, { expiresInSeconds: 24 * 60 * 60 }),
      documents: mapCloudinaryDocUrls(pickup?.documents, { expiresInSeconds: 24 * 60 * 60 }),
    },
  });
});

// @desc    Get installation documents (PDF) for a ticket
// @route   GET /api/tickets/:id/installation-documents
export const getTicketInstallationDocuments = asyncHandler(async (req: any, res: any) => {
  const ticket = await Ticket.findOne({ _id: req.params.id, ...ticketScopeQuery(req.user) }).select("status installation");
  if (!ticket) return res.status(404).json({ success: false, message: "Ticket not found" });

  res.json({
    success: true,
    data: {
      documents: mapInstallationDocsForResponse(getInstallationDocs(ticket)),
    },
  });
});

// @desc    Upload installation document (PDF) for a ticket (visible to all ticket viewers)
// @route   POST /api/tickets/:id/installation-documents
export const uploadTicketInstallationDocument = asyncHandler(async (req: any, res: any) => {
  const ticket = await Ticket.findOne({ _id: req.params.id, ...ticketScopeQuery(req.user) }).select("status installation");
  if (!ticket) return res.status(404).json({ success: false, message: "Ticket not found" });

  if (String(ticket.status || "").toUpperCase() === "CLOSED") {
    return res.status(400).json({ success: false, message: "Closed tickets cannot be updated." });
  }

  const flow = normalizeFlowStatus(ticket.status);
  if (flow !== "DISPATCHED" && flow !== "INSTALLATION_DONE") {
    return res.status(400).json({
      success: false,
      message: "Installation documents can be uploaded only after the ticket is DISPATCHED.",
    });
  }

  const file = req.file;
  if (!file || !file.buffer) {
    return res.status(400).json({ success: false, message: "Missing file upload" });
  }

  ensureCloudinaryConfigured();
  const folder =
    String(process.env.CLOUDINARY_FOLDER || "sunce_erp/installation").trim() || "sunce_erp/installation";
  const ticketSeg = String(req.params?.id || "ticket")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .slice(0, 40);
  const stamp = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const publicId = `${ticketSeg}_${stamp}`;

  const uploaded = await new Promise<{ secure_url: string }>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        resource_type: "auto",
        access_mode: "public",
      },
      (err, result) => {
        if (err) return reject(err);
        if (!result || !(result as any).secure_url) return reject(new Error("Cloudinary upload failed"));
        resolve({ secure_url: String((result as any).secure_url) });
      },
    );
    stream.end(file.buffer);
  });

  const roleNorm = String(req.user?.role?.name || "").toUpperCase();
  const doc = {
    url: String(uploaded.secure_url),
    uploadedAt: new Date(),
    uploadedBy: req.user?._id,
    uploadedByRole: roleNorm,
    originalName: String(file.originalname || ""),
    mimeType: String(file.mimetype || ""),
    size: typeof file.size === "number" ? file.size : undefined,
  };

  (ticket as any).installation = {
    ...(ticket as any).installation,
    documents: [...getInstallationDocs(ticket), doc],
  };

  await ticket.save();

  const docs = mapInstallationDocsForResponse(getInstallationDocs(ticket));

  res.status(201).json({
    success: true,
    data: {
      document: docs[docs.length - 1] || null,
      documents: docs,
    },
  });
});

// @desc    Get (or create) jobcard for a ticket
// @route   GET /api/tickets/:id/jobcard
export const getTicketJobCard = asyncHandler(async (req: any, res: any) => {
  let ticket: any = await Ticket.findOne({ _id: req.params.id, ...ticketScopeQuery(req.user) }).populate('jobCard');
  if (!ticket && String(req.user?.role?.name || "").toUpperCase() === "ENGINEER") {
    // Legacy fallback: allow viewing job card for tickets engineer finalized.
    const raw: any = await Ticket.findById(req.params.id).populate("jobCard");
    const finalizedBy = raw?.jobCard?.engineerFinalizedBy ? String(raw.jobCard.engineerFinalizedBy) : "";
    if (finalizedBy && finalizedBy === String(req.user?._id || "")) {
      ticket = raw;
    }
  }
  if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });

  if (ticket.jobCard) {
    // Ensure defaults exist (non-destructive)
    if (!ticket.jobCard.finalTestingActivities?.length) {
      ticket.jobCard.finalTestingActivities = DEFAULT_FINAL_TESTING_ACTIVITIES;
      await ticket.jobCard.save();
    }
    return res.json({ success: true, data: ticket.jobCard });
  }

  const jobcard = await JobCard.create({
    ticket: ticket._id,
    customerName: ticket.customer?.company || ticket.customer?.name,
    finalTestingActivities: DEFAULT_FINAL_TESTING_ACTIVITIES,
  });

  ticket.jobCard = jobcard._id;
  await ticket.save();

  res.status(201).json({ success: true, data: jobcard });
});

function pickJobCardUpdate(input) {
  if (!input || typeof input !== 'object') return {};
  const allowedKeys = [
    'jobNo',
    'item',
    'itemAndSiteDetails',
    'customerName',
    'inDate',
    'outDate',
    'currentStatus',
    'remarks',
    'checkedByName',
    'checkedByDate',
    'serviceJobs',
    'finalTestingActivities',
    'finalStatus',
    'finalRemarks',
    'finalCheckedByName',
    'finalCheckedByDate',
    // Keep legacy fields editable if already used
    'diagnosis',
    'repairActionsByName',
    'repairNotes',
    'testResults',
    'warrantyGiven',
    'spareParts',
    'totalCost',
    'stages',
    'testedBy',
  ];

  const out = {};
  for (const k of allowedKeys) {
    if (Object.prototype.hasOwnProperty.call(input, k)) out[k] = input[k];
  }
  return out;
}

// @desc    Update (or create) jobcard for a ticket
// @route   PUT /api/tickets/:id/jobcard
export const updateTicketJobCard = asyncHandler(async (req: any, res: any) => {
  const ticket = await Ticket.findOne({ _id: req.params.id, ...ticketScopeQuery(req.user) });
  if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });
  if (
    String(req.user?.role?.name || "").toUpperCase() === "ENGINEER" &&
    String(ticket.status || "").toUpperCase() === "CLOSED"
  ) {
    return res.status(400).json({ success: false, message: "Closed tickets are read-only for engineers." });
  }

  let jobcard = null;
  if (ticket.jobCard) {
    jobcard = await JobCard.findById(ticket.jobCard);
  }

  const patch = pickJobCardUpdate(req.body);
  const requestedFinal = String(req.body?.engineerFinalStatus || "").toUpperCase().trim();
  const requestedFinalizedAt = toDateOrNull(req.body?.engineerFinalizedAt);
  const canSetFinal = requestedFinal === "REPAIRABLE" || requestedFinal === "NOT_REPAIRABLE";
  const roleName = String(req.user?.role?.name || "").toUpperCase();

  const created = !jobcard;
  if (!jobcard) {
    jobcard = await JobCard.create({
      ticket: ticket._id,
      customerName: ticket.customer?.company || ticket.customer?.name,
      finalTestingActivities: DEFAULT_FINAL_TESTING_ACTIVITIES,
      ...patch,
    });
    ticket.jobCard = jobcard._id;
    await ticket.save();
  } else {
    jobcard.set(patch);

    // Ensure defaults are present if client sends empty list unintentionally
    if (!jobcard.finalTestingActivities?.length) {
      jobcard.finalTestingActivities = DEFAULT_FINAL_TESTING_ACTIVITIES;
    }

    await jobcard.save();
  }

  // Engineer final decision: engineer has the final authority (sales does not approve).
  // We only allow engineers (and admins) to set the final status.
  if (canSetFinal) {
    if (roleName !== "ENGINEER" && roleName !== "ADMIN") {
      return res.status(403).json({
        success: false,
        message: "Access denied: Only engineers can finalize job cards.",
      });
    }
    (jobcard as any).engineerFinalStatus = requestedFinal;
    (jobcard as any).engineerFinalizedAt = requestedFinalizedAt || new Date();
    (jobcard as any).engineerFinalizedBy = req.user?._id;
    await jobcard.save();

    // Notify sales/admin when engineer scraps the unit.
    if (requestedFinal === "NOT_REPAIRABLE") {
      try {
        const roles = await Role.find({ name: { $in: ["SALES", "ADMIN"] } }).select("_id name");
        const roleIds = roles.map((r: any) => r._id).filter(Boolean);
        const rows = await User.find({ role: { $in: roleIds }, isActive: true })
          .select("email name")
          .lean();
        const emails = Array.from(
          new Set(
            (rows || [])
              .map((u: any) => String(u?.email || "").trim().toLowerCase())
              .filter(Boolean),
          ),
        );

        const ticketId = String((ticket as any).ticketId || ticket._id || "");
        const who = String(req.user?.name || req.user?._id || "");
        const diagnosis = String(jobcard.diagnosis || "").trim();
        const subject = `Ticket ${ticketId} SCRAP / NOT REPAIRABLE`;
        const text =
          `Engineer finalized ticket ${ticketId} as NOT REPAIRABLE (SCRAP).\n\n` +
          `By: ${who}\n\n` +
          (diagnosis ? `Diagnosis:\n${diagnosis}\n\n` : "") +
          `Please proceed with next action (dispatch/closure) in ERP.`;

        await Promise.all(
          emails.map((to) =>
            sendEmail({ to, subject, text }).catch((e) => {
              console.warn("📧 Failed to notify:", to, e?.message || e);
              return { sent: false };
            }),
          ),
        );
      } catch (e: any) {
        console.warn("📧 Sales notification failed:", e?.message || e);
      }
    }
  }

  // If an engineer worked on this job card, keep them attached to the ticket so they
  // can see it later in their list even after sales/admin closes it.
  if (roleName === "ENGINEER" && req.user?._id) {
    const existing = Array.isArray((ticket as any).assignedTo) ? (ticket as any).assignedTo : [];
    const uid = String(req.user._id);
    const has = existing.some((x: any) => String(x) === uid);
    if (!has) {
      (ticket as any).assignedTo = [...existing, req.user._id];
      await ticket.save();
    }
  }

  res.status(created ? 201 : 200).json({ success: true, data: jobcard });
});
// named exports above
