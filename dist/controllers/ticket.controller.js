"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateTicketJobCard = exports.getTicketJobCard = exports.uploadTicketInstallationDocument = exports.getTicketInstallationDocuments = exports.uploadTicketPickupDocument = exports.upsertTicketPickupDetails = exports.getTicketPickupDetails = exports.approveInstallationDone = exports.upsertOnsiteJobCard = exports.assignOnsiteBooking = exports.updateTicket = exports.getTicket = exports.createTicketsBulk = exports.createTicket = exports.getTickets = void 0;
const Ticket_model_1 = __importDefault(require("../models/Ticket.model"));
const JobCard_model_1 = __importDefault(require("../models/JobCard.model"));
const Logistics_model_1 = __importDefault(require("../models/Logistics.model"));
const Role_model_1 = __importDefault(require("../models/Role.model"));
const User_model_1 = __importDefault(require("../models/User.model"));
const CustomerCompany_model_1 = __importDefault(require("../models/CustomerCompany.model"));
const error_middleware_1 = require("../middleware/error.middleware");
const helpers_1 = require("../utils/helpers");
const cloudinary_1 = require("../config/cloudinary");
const cloudinaryDownloadUrl_1 = require("../utils/cloudinaryDownloadUrl");
const email_1 = require("../utils/email");
const company_rep_seed_json_1 = __importDefault(require("../data/company_rep_seed.json"));
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
function addDays(d, days) {
    return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}
function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function normalizeCompanyKey(input) {
    const raw = String(input || "").trim();
    if (!raw)
        return null;
    const collapsed = raw.replace(/\s+/g, " ").trim();
    if (!collapsed)
        return null;
    return collapsed.toLowerCase();
}
let customerCompanySeeded = null;
async function ensureCustomerCompaniesSeeded() {
    if (customerCompanySeeded === true)
        return;
    const count = await CustomerCompany_model_1.default.estimatedDocumentCount().catch(() => 0);
    if (count > 0) {
        customerCompanySeeded = true;
        return;
    }
    const seedRows = Array.isArray(company_rep_seed_json_1.default) ? company_rep_seed_json_1.default : [];
    const docs = seedRows
        .map((r) => {
        const name = String(r?.name || "").trim();
        const key = String(r?.key || "").trim();
        const repEmail = String(r?.repEmail || "").trim().toLowerCase();
        if (!name || !key)
            return null;
        return { name, key, ...(repEmail ? { repEmail } : {}) };
    })
        .filter(Boolean);
    try {
        await CustomerCompany_model_1.default.insertMany(docs, { ordered: false });
    }
    catch {
        // ignore duplicates
    }
    customerCompanySeeded = true;
}
async function resolveSalesAssigneeForCompany(companyName) {
    const key = normalizeCompanyKey(companyName);
    if (!key)
        return null;
    await ensureCustomerCompaniesSeeded();
    const row = await CustomerCompany_model_1.default.findOne({ key }).select("repEmail").lean();
    const repEmail = row?.repEmail ? String(row.repEmail).trim().toLowerCase() : "";
    if (!repEmail)
        return null;
    const user = await User_model_1.default.findOne({ email: repEmail }).select("_id name email role").populate("role", "name").lean();
    const safeEmail = String(user?.email || repEmail || "").trim().toLowerCase();
    const safeName = String(user?.name || "").trim() || safeEmail.split("@")[0] || safeEmail;
    return {
        ...(user?._id ? { userId: user._id } : {}),
        email: safeEmail,
        name: safeName,
    };
}
function getAutoWarrantyPrefix(serialNo) {
    const raw = String(serialNo || "").trim().toUpperCase();
    if (!raw)
        return null;
    const hit = AUTO_WARRANTY_SERIAL_PREFIXES.find((p) => raw.startsWith(String(p).toUpperCase()));
    return hit || null;
}
function latestStatusChangedAt(statusHistory, status) {
    const target = String(status || "").toUpperCase();
    const rows = Array.isArray(statusHistory) ? statusHistory : [];
    let best = null;
    for (const r of rows) {
        const s = String(r?.status || "").toUpperCase();
        if (s !== target)
            continue;
        const d = r?.changedAt ? new Date(r.changedAt) : null;
        if (!d || Number.isNaN(d.getTime()))
            continue;
        if (!best || d.getTime() > best.getTime())
            best = d;
    }
    return best;
}
async function computeAutoWarrantyEnd(prefix) {
    const p = String(prefix || "").trim();
    if (!p)
        return null;
    const prev = await Ticket_model_1.default.findOne({
        status: { $in: ["UNDER_DISPATCH", "DISPATCHED", "INSTALLATION_DONE", "CLOSED"] },
        "inverter.serialNo": { $regex: `^${escapeRegExp(p)}`, $options: "i" },
    })
        .select("_id inverter.warrantyEnd statusHistory updatedAt createdAt")
        .sort({ updatedAt: -1, createdAt: -1 })
        .lean();
    if (!prev?._id)
        return null;
    const existing = prev?.inverter?.warrantyEnd ? new Date(prev.inverter.warrantyEnd) : null;
    if (existing && !Number.isNaN(existing.getTime()))
        return existing;
    // Prefer explicit dispatch scheduling date if present.
    const prevLog = await Logistics_model_1.default.findOne({ ticket: prev._id, type: "DELIVERY" })
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
    if (!assumedDispatchAt || Number.isNaN(assumedDispatchAt.getTime()))
        return null;
    return addDays(assumedDispatchAt, WARRANTY_AFTER_DISPATCH_DAYS);
}
// @desc    Get all tickets
// @route   GET /api/tickets
exports.getTickets = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const { page = 1, limit = 20, status, priority, slaStatus, search } = req.query;
    const { skip, limit: lim } = (0, helpers_1.getPagination)(page, limit);
    const query = {
        ...(status && { status }),
        ...(priority && { 'issue.priority': priority }),
        ...(slaStatus && { slaStatus }),
        ...(search && { $or: [
                { ticketId: { $regex: search, $options: 'i' } },
                { 'customer.name': { $regex: search, $options: 'i' } },
                { 'issue.description': { $regex: search, $options: 'i' } }
            ] })
    };
    // Role-scoped visibility
    const roleName = String(req.user?.role?.name || "").trim().toUpperCase();
    if (roleName === 'ENGINEER') {
        // Engineers should only receive work when Sales/Admin moves it to UNDER_REPAIRED.
        const finalizedRows = await JobCard_model_1.default.find({ engineerFinalizedBy: req.user._id })
            .select("ticket")
            .lean();
        const finalizedTicketIds = Array.from(new Set((finalizedRows || []).map((r) => String(r?.ticket || "")).filter(Boolean)));
        // NOTE: On-site (offline booking) tickets must be visible only to the assigned engineer.
        const visibilityOr = [{ status: "UNDER_REPAIRED", serviceType: { $ne: "ONSITE" } }];
        if (finalizedTicketIds.length)
            visibilityOr.push({ _id: { $in: finalizedTicketIds } });
        visibilityOr.push({ assignedTo: req.user._id });
        const existingSearchOr = query.$or;
        delete query.$or;
        query.$and = [
            { $or: visibilityOr },
            ...(existingSearchOr ? [{ $or: existingSearchOr }] : []),
        ];
    }
    if (roleName === 'CUSTOMER') {
        // Only show tickets belonging to this customer.
        // Prefer explicit `createdBy`, but also allow matching by the embedded customer identity
        // so staff-created tickets remain visible to the customer.
        const email = req.user?.email ? String(req.user.email).trim().toLowerCase() : "";
        const phone = req.user?.phone ? String(req.user.phone).trim() : "";
        const name = req.user?.name ? String(req.user.name).trim() : "";
        const legacyMatch = phone
            ? { "customer.phone": phone }
            : name
                ? { "customer.name": name }
                : null;
        const visibilityOr = [{ createdBy: req.user._id }];
        if (email)
            visibilityOr.push({ "customer.email": email });
        if (phone)
            visibilityOr.push({ "customer.phone": phone });
        if (!email && !phone && name)
            visibilityOr.push({ "customer.name": name });
        if (legacyMatch) {
            visibilityOr.push({ createdBy: { $exists: false }, ...legacyMatch });
            visibilityOr.push({ createdBy: null, ...legacyMatch });
        }
        const existingSearchOr = query.$or;
        delete query.$or;
        query.$and = [
            { $or: visibilityOr },
            ...(existingSearchOr ? [{ $or: existingSearchOr }] : []),
        ];
    }
    const ticketsQuery = Ticket_model_1.default.find(query)
        .populate('createdBy', 'email name phone')
        .populate('assignedTo', 'name')
        .populate('salesAssignee', 'name email')
        .populate('statusHistory.changedBy', 'name')
        .sort('-createdAt')
        .skip(skip)
        .limit(lim);
    if (roleName === "CUSTOMER") {
        // Customers must never see warranty validity/dates.
        ticketsQuery.select("-inverter.warrantyEnd");
    }
    const tickets = await ticketsQuery;
    const total = await Ticket_model_1.default.countDocuments(query);
    res.json({
        success: true,
        data: {
            tickets,
            pagination: { total, page: parseInt(page), limit: lim, pages: Math.ceil(total / lim) }
        }
    });
});
function ticketScopeQuery(user) {
    const roleName = String(user?.role?.name || "").trim().toUpperCase();
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
        const email = user?.email ? String(user.email).trim().toLowerCase() : "";
        const phone = user?.phone ? String(user.phone).trim() : "";
        const name = user?.name ? String(user.name).trim() : "";
        const legacyMatch = phone
            ? { "customer.phone": phone }
            : name
                ? { "customer.name": name }
                : null;
        const visibilityOr = [{ createdBy: user._id }];
        if (email)
            visibilityOr.push({ "customer.email": email });
        if (phone)
            visibilityOr.push({ "customer.phone": phone });
        // Last resort only when we don't have stable identifiers.
        if (!email && !phone && name)
            visibilityOr.push({ "customer.name": name });
        if (legacyMatch) {
            visibilityOr.push({ createdBy: { $exists: false }, ...legacyMatch });
            visibilityOr.push({ createdBy: null, ...legacyMatch });
        }
        return {
            $or: visibilityOr,
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
    if (STATUS_FLOW.includes(s))
        return s;
    // Legacy backend statuses collapse into "UNDER_REPAIRED"
    if (['RECEIVED', 'DIAGNOSIS', 'REPAIR', 'TESTING'].includes(s))
        return 'UNDER_REPAIRED';
    return 'CREATED';
}
function toDateOrNull(v) {
    if (!v)
        return null;
    const d = new Date(v);
    const t = d.getTime();
    if (Number.isNaN(t))
        return null;
    return d;
}
function getInstallationDocs(ticket) {
    const docs = ticket && typeof ticket === "object" ? ticket.installation?.documents : null;
    return Array.isArray(docs) ? docs : [];
}
function mapInstallationDocsForResponse(docs) {
    return (Array.isArray(docs) ? docs : []).map((d) => {
        const obj = d && typeof d?.toObject === "function"
            ? d.toObject()
            : d && typeof d === "object"
                ? { ...d }
                : {};
        const url = String(obj?.url || "");
        return {
            ...obj,
            url: url ? (0, cloudinaryDownloadUrl_1.toCloudinaryPrivateDownloadUrl)(url, { expiresInSeconds: 24 * 60 * 60 }) : url,
        };
    });
}
function applyInstallationApproval(ticket, user) {
    const roleNorm = String(user?.role?.name || "").trim().toUpperCase();
    ticket.status = "INSTALLATION_DONE";
    ticket.installation = {
        ...ticket.installation,
        approved: true,
        approvedAt: new Date(),
        approvedBy: user?._id,
        approvedByRole: roleNorm,
    };
}
// @desc    Create ticket
// @route   POST /api/tickets
exports.createTicket = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const roleName = String(req.user?.role?.name || "").trim().toUpperCase();
    const body = { ...(req.body || {}) };
    if (Object.prototype.hasOwnProperty.call(body, "serviceType")) {
        const st = String(body.serviceType || "").trim().toUpperCase();
        if (st === "STANDARD" || st === "ONSITE")
            body.serviceType = st;
        else
            delete body.serviceType;
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
        const hasWarrantyEnd = body?.inverter &&
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
        const inputCustomer = typeof body.customer === 'object' && body.customer ? body.customer : {};
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
    // Auto-assign Sales owner based on customer company → rep mapping.
    if (Object.prototype.hasOwnProperty.call(body, "salesAssignee"))
        delete body.salesAssignee;
    if (Object.prototype.hasOwnProperty.call(body, "salesAssigneeEmail"))
        delete body.salesAssigneeEmail;
    if (Object.prototype.hasOwnProperty.call(body, "salesAssigneeName"))
        delete body.salesAssigneeName;
    const salesAssignee = await resolveSalesAssigneeForCompany(body?.customer?.company);
    if (salesAssignee) {
        if (salesAssignee.userId)
            body.salesAssignee = salesAssignee.userId;
        body.salesAssigneeEmail = salesAssignee.email;
        body.salesAssigneeName = salesAssignee.name;
    }
    const ticket = await Ticket_model_1.default.create({
        ...body,
        createdBy: req.user?._id,
        statusHistory: [{ status: 'CREATED', changedBy: req.user._id }]
    });
    await ticket.populate('statusHistory.changedBy', 'name');
    await ticket.populate('salesAssignee', 'name email');
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
exports.createTicketsBulk = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const roleName = String(req.user?.role?.name || "").trim().toUpperCase();
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
    const bodies = raw.map((t) => (t && typeof t === "object" ? { ...t } : null));
    if (bodies.some((b) => !b)) {
        return res.status(400).json({ success: false, message: "Each ticket must be an object" });
    }
    for (const body of bodies) {
        if (Object.prototype.hasOwnProperty.call(body, "serviceType")) {
            const st = String(body.serviceType || "").trim().toUpperCase();
            if (st === "STANDARD" || st === "ONSITE")
                body.serviceType = st;
            else
                delete body.serviceType;
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
    const existing = await Ticket_model_1.default.find({ ticketId: { $in: ticketIds } }).select("ticketId").lean();
    if (existing.length) {
        const ids = existing
            .map((r) => String(r?.ticketId || "").trim())
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
            const inputCustomer = typeof body.customer === "object" && body.customer ? body.customer : {};
            body.customer = {
                ...inputCustomer,
                name: String(inputCustomer?.name || "").trim() || req.user.name,
                ...(inputCustomer?.email ? {} : req.user.email ? { email: req.user.email } : {}),
                ...(inputCustomer?.company ? {} : req.user.company ? { company: req.user.company } : {}),
                ...(inputCustomer?.phone ? {} : req.user.phone ? { phone: req.user.phone } : {}),
            };
        }
    }
    const computedWarrantyByPrefix = new Map();
    for (const body of bodies) {
        const prefix = getAutoWarrantyPrefix(body?.inverter?.serialNo);
        if (!prefix)
            continue;
        const hasWarrantyEnd = body?.inverter &&
            typeof body.inverter === "object" &&
            Object.prototype.hasOwnProperty.call(body.inverter, "warrantyEnd") &&
            body.inverter.warrantyEnd;
        if (hasWarrantyEnd)
            continue;
        let end = computedWarrantyByPrefix.get(prefix);
        if (!end) {
            const computed = await computeAutoWarrantyEnd(prefix);
            end = computed || addDays(new Date(), ASSUMED_DISPATCH_LAG_DAYS + WARRANTY_AFTER_DISPATCH_DAYS);
            computedWarrantyByPrefix.set(prefix, end);
        }
        body.inverter = body.inverter && typeof body.inverter === "object" ? body.inverter : {};
        body.inverter.warrantyEnd = end;
    }
    // Auto-assign Sales owner for each ticket based on customer company → rep mapping.
    for (const body of bodies) {
        if (Object.prototype.hasOwnProperty.call(body, "salesAssignee"))
            delete body.salesAssignee;
        if (Object.prototype.hasOwnProperty.call(body, "salesAssigneeEmail"))
            delete body.salesAssigneeEmail;
        if (Object.prototype.hasOwnProperty.call(body, "salesAssigneeName"))
            delete body.salesAssigneeName;
        const salesAssignee = await resolveSalesAssigneeForCompany(body?.customer?.company);
        if (salesAssignee) {
            if (salesAssignee.userId)
                body.salesAssignee = salesAssignee.userId;
            body.salesAssigneeEmail = salesAssignee.email;
            body.salesAssigneeName = salesAssignee.name;
        }
    }
    const payload = bodies.map((body) => ({
        ...body,
        createdBy: req.user?._id,
        statusHistory: [{ status: "CREATED", changedBy: req.user._id }],
    }));
    const created = await Ticket_model_1.default.insertMany(payload, { ordered: true });
    await Ticket_model_1.default.populate(created, { path: "statusHistory.changedBy", select: "name" });
    await Ticket_model_1.default.populate(created, { path: "salesAssignee", select: "name email" });
    const tickets = (created || []).map((t) => {
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
exports.getTicket = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const roleName = String(req.user?.role?.name || "").trim().toUpperCase();
    const scopedQuery = { _id: req.params.id, ...ticketScopeQuery(req.user) };
    const ticketQuery = Ticket_model_1.default.findOne(scopedQuery)
        .populate('createdBy', 'email name phone')
        .populate('assignedTo', 'name')
        .populate('salesAssignee', 'name email')
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
        const raw = await Ticket_model_1.default.findById(req.params.id).select("jobCard").lean();
        const jobCardId = raw?.jobCard ? String(raw.jobCard) : "";
        if (jobCardId) {
            const jc = await JobCard_model_1.default.findById(jobCardId).select("engineerFinalizedBy").lean();
            if (String(jc?.engineerFinalizedBy || "") === String(req.user?._id || "")) {
                ticket = await Ticket_model_1.default.findById(req.params.id)
                    .populate('createdBy', 'email name phone')
                    .populate('assignedTo', 'name')
                    .populate('salesAssignee', 'name email')
                    .populate('jobCard')
                    .populate('logistics')
                    .populate('statusHistory.changedBy', 'name');
            }
        }
    }
    if (!ticket)
        return res.status(404).json({ success: false, message: 'Ticket not found' });
    res.json({ success: true, data: ticket });
});
// @desc    Update ticket
// @route   PUT /api/tickets/:id
exports.updateTicket = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const roleName = req.user?.role?.name;
    const ticket = await Ticket_model_1.default.findOne({ _id: req.params.id, ...ticketScopeQuery(req.user) });
    if (!ticket)
        return res.status(404).json({ success: false, message: 'Ticket not found' });
    // Extra safety beyond RBAC: enforce *which fields* each role can modify.
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const topKeys = Object.keys(body);
    const roleNorm = String(roleName || "").trim().toUpperCase();
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
    const isOnsite = String(ticket?.serviceType || "").toUpperCase() === "ONSITE";
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
        }
        else {
            const prevIdx = STATUS_FLOW.indexOf(prevFlow);
            const nextIdx = STATUS_FLOW.indexOf(nextFlow);
            // Business rule: Sales can proceed to DISPATCHED only after Admin approval.
            if (roleNorm === "SALES" && nextFlow === "DISPATCHED") {
                const delivery = await Logistics_model_1.default.findOne({ ticket: ticket._id, type: "DELIVERY" })
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
            }
            else {
                ticket.set('status', body.status);
            }
        }
        if (Object.prototype.hasOwnProperty.call(body, 'slaStatus'))
            ticket.set('slaStatus', body.slaStatus);
        if (Object.prototype.hasOwnProperty.call(body, 'slaTargetDate'))
            ticket.set('slaTargetDate', body.slaTargetDate);
        if (body.customer && typeof body.customer === 'object') {
            if (Object.prototype.hasOwnProperty.call(body.customer, 'name'))
                ticket.set('customer.name', body.customer.name);
            if (Object.prototype.hasOwnProperty.call(body.customer, 'phone'))
                ticket.set('customer.phone', body.customer.phone);
            if (Object.prototype.hasOwnProperty.call(body.customer, 'company'))
                ticket.set('customer.company', body.customer.company);
            if (Object.prototype.hasOwnProperty.call(body.customer, 'address'))
                ticket.set('customer.address', body.customer.address);
        }
        if (body.inverter && typeof body.inverter === 'object') {
            if (Object.prototype.hasOwnProperty.call(body.inverter, 'make'))
                ticket.set('inverter.make', body.inverter.make);
            if (Object.prototype.hasOwnProperty.call(body.inverter, 'model'))
                ticket.set('inverter.model', body.inverter.model);
            if (Object.prototype.hasOwnProperty.call(body.inverter, 'serialNo'))
                ticket.set('inverter.serialNo', body.inverter.serialNo);
            if (Object.prototype.hasOwnProperty.call(body.inverter, 'capacity'))
                ticket.set('inverter.capacity', body.inverter.capacity);
            if (Object.prototype.hasOwnProperty.call(body.inverter, 'installationDate'))
                ticket.set('inverter.installationDate', body.inverter.installationDate);
            if (Object.prototype.hasOwnProperty.call(body.inverter, 'warrantyEnd'))
                ticket.set('inverter.warrantyEnd', body.inverter.warrantyEnd);
        }
        if (body.issue && typeof body.issue === 'object') {
            if (Object.prototype.hasOwnProperty.call(body.issue, 'description'))
                ticket.set('issue.description', body.issue.description);
            if (Object.prototype.hasOwnProperty.call(body.issue, 'errorCode'))
                ticket.set('issue.errorCode', body.issue.errorCode);
            if (Object.prototype.hasOwnProperty.call(body.issue, 'priority'))
                ticket.set('issue.priority', body.issue.priority);
            if (Object.prototype.hasOwnProperty.call(body.issue, 'photos'))
                ticket.set('issue.photos', body.issue.photos);
        }
        if (Object.prototype.hasOwnProperty.call(body, 'assignedTo'))
            ticket.set('assignedTo', body.assignedTo);
        if (Object.prototype.hasOwnProperty.call(body, 'customerFeedback'))
            ticket.set('customerFeedback', body.customerFeedback);
        if (Object.prototype.hasOwnProperty.call(body, 'feedbackRating'))
            ticket.set('feedbackRating', body.feedbackRating);
    }
    if (roleNorm === 'ENGINEER') {
        if (Object.prototype.hasOwnProperty.call(body, 'status')) {
            if (String(body.status || "").toUpperCase() === "INSTALLATION_DONE") {
                applyInstallationApproval(ticket, req.user);
            }
            else {
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
exports.assignOnsiteBooking = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const roleNorm = String(req.user?.role?.name || "").trim().toUpperCase();
    if (roleNorm !== "ADMIN" && roleNorm !== "SALES") {
        return res.status(403).json({ success: false, message: "Access denied." });
    }
    const ticket = await Ticket_model_1.default.findById(req.params.id)
        .populate("createdBy", "email name phone")
        .populate("assignedTo", "name")
        .populate("statusHistory.changedBy", "name")
        .populate("logistics");
    if (!ticket)
        return res.status(404).json({ success: false, message: "Ticket not found" });
    const isOnsite = String(ticket?.serviceType || "").toUpperCase() === "ONSITE";
    if (!isOnsite) {
        return res.status(400).json({ success: false, message: "This ticket is not an on-site (offline booking) ticket." });
    }
    if (String(ticket.status || "").toUpperCase() === "CLOSED") {
        return res.status(400).json({ success: false, message: "Closed tickets cannot be updated." });
    }
    const bodyEngineerId = String(req.body?.engineerId || "").trim();
    const envDefaultEngineerId = String(process.env.ONSITE_DEFAULT_ENGINEER_ID || process.env.DEFAULT_ENGINEER_ID || "").trim();
    const envDefaultEngineerEmail = String(process.env.ONSITE_DEFAULT_ENGINEER_EMAIL || process.env.DEFAULT_ENGINEER_EMAIL || "")
        .trim()
        .toLowerCase();
    const findFirstEngineer = async (preferredEmail) => {
        const engineerRole = await Role_model_1.default.findOne({ name: "ENGINEER" }).select("_id").lean();
        if (!engineerRole?._id)
            return null;
        const baseQuery = { role: engineerRole._id, isActive: true };
        if (preferredEmail)
            baseQuery.email = preferredEmail;
        let u = await User_model_1.default.findOne(baseQuery).sort({ createdAt: 1 }).select("_id").lean();
        if (!u && preferredEmail) {
            u = await User_model_1.default.findOne({ role: engineerRole._id, isActive: true })
                .sort({ createdAt: 1 })
                .select("_id")
                .lean();
        }
        return u;
    };
    const ensureEngineerUserId = async (candidateId) => {
        const id = String(candidateId || "").trim();
        if (!id)
            return null;
        const u = await User_model_1.default.findById(id).populate("role", "name");
        const roleName = String(u?.role?.name || "").trim().toUpperCase();
        if (!u?._id || !u?.isActive || roleName !== "ENGINEER")
            return null;
        return String(u._id);
    };
    let engineerId = (await ensureEngineerUserId(bodyEngineerId)) ||
        (await ensureEngineerUserId(envDefaultEngineerId)) ||
        (await (async () => {
            const u = await findFirstEngineer(envDefaultEngineerEmail || undefined);
            return u?._id ? String(u._id) : null;
        })());
    if (!engineerId) {
        return res.status(400).json({
            success: false,
            message: "No engineer user found to assign. Create an active ENGINEER user, or set ONSITE_DEFAULT_ENGINEER_ID.",
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
exports.upsertOnsiteJobCard = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const roleNorm = String(req.user?.role?.name || "").trim().toUpperCase();
    if (roleNorm !== "ENGINEER") {
        return res.status(403).json({ success: false, message: "Access denied." });
    }
    const ticket = await Ticket_model_1.default.findOne({ _id: req.params.id, assignedTo: req.user._id })
        .populate("createdBy", "email name phone")
        .populate("assignedTo", "name")
        .populate("statusHistory.changedBy", "name")
        .populate("logistics");
    if (!ticket)
        return res.status(404).json({ success: false, message: "Ticket not found" });
    const isOnsite = String(ticket?.serviceType || "").toUpperCase() === "ONSITE";
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
    ticket.onsite = ticket.onsite || {};
    ticket.onsite.engineerName =
        engineerName || String(req.user?.name || "").trim() || ticket.onsite.engineerName;
    if (visitDate)
        ticket.onsite.visitDate = visitDate;
    if (remark !== null)
        ticket.onsite.remark = remark;
    if (markRepaired) {
        ticket.onsite.markedRepairedAt = new Date();
        ticket.onsite.markedRepairedBy = req.user?._id;
        ticket.status = "CLOSED";
        ticket.statusHistory.push({ status: "CLOSED", changedBy: req.user._id });
    }
    await ticket.save();
    res.status(200).json({ success: true, data: ticket });
});
// @desc    Approve installation (moves ticket DISPATCHED -> INSTALLATION_DONE)
// @route   POST /api/tickets/:id/installation-done
exports.approveInstallationDone = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const roleNorm = String(req.user?.role?.name || "").trim().toUpperCase();
    if (!["CUSTOMER", "SALES", "ADMIN", "ENGINEER"].includes(roleNorm)) {
        return res.status(403).json({ success: false, message: "Access denied." });
    }
    const ticket = await Ticket_model_1.default.findOne({ _id: req.params.id, ...ticketScopeQuery(req.user) })
        .populate("createdBy", "email name phone")
        .populate("assignedTo", "name")
        .populate("statusHistory.changedBy", "name")
        .populate("logistics");
    if (!ticket)
        return res.status(404).json({ success: false, message: "Ticket not found" });
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
    if (shouldPushHistory)
        ticket.statusHistory.push({ status: ticket.status, changedBy: req.user._id });
    await ticket.save();
    await ticket.populate("statusHistory.changedBy", "name");
    res.status(200).json({ success: true, data: ticket });
});
// @desc    Get pickup details for a ticket (customer-friendly)
// @route   GET /api/tickets/:id/pickup-details
exports.getTicketPickupDetails = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const ticket = await Ticket_model_1.default.findOne({ _id: req.params.id, ...ticketScopeQuery(req.user) });
    if (!ticket)
        return res.status(404).json({ success: false, message: "Ticket not found" });
    const pickup = await Logistics_model_1.default.findOne({ ticket: ticket._id, type: "PICKUP" }).sort("-updatedAt");
    res.json({
        success: true,
        data: {
            pickupDate: pickup?.pickupDetails?.scheduledDate || null,
            pickupLocation: String(pickup?.pickupDetails?.pickupLocation || ticket.customer?.address || ""),
            documents: (0, cloudinaryDownloadUrl_1.mapCloudinaryDocUrls)(pickup?.documents, { expiresInSeconds: 24 * 60 * 60 }),
        },
    });
});
// @desc    Upsert pickup details for a ticket (customer input)
// @route   POST /api/tickets/:id/pickup-details
exports.upsertTicketPickupDetails = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const roleName = String(req.user?.role?.name || "").trim().toUpperCase();
    if (roleName !== "ADMIN" && roleName !== "SALES") {
        return res.status(403).json({ success: false, message: "Access denied." });
    }
    const ticket = await Ticket_model_1.default.findOne({ _id: req.params.id, ...ticketScopeQuery(req.user) });
    if (!ticket)
        return res.status(404).json({ success: false, message: "Ticket not found" });
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
    const pickup = await Logistics_model_1.default.findOneAndUpdate({ ticket: ticket._id, type: "PICKUP" }, {
        $set: {
            type: "PICKUP",
            "pickupDetails.scheduledDate": pickupDate,
            "pickupDetails.pickupLocation": pickupLocation,
        },
    }, { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true });
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
            documents: (0, cloudinaryDownloadUrl_1.mapCloudinaryDocUrls)(pickup?.documents, { expiresInSeconds: 24 * 60 * 60 }),
        },
    });
});
// @desc    Upload pickup document (PDF/Image) for a ticket
// @route   POST /api/tickets/:id/pickup-documents
exports.uploadTicketPickupDocument = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const roleName = String(req.user?.role?.name || "").trim().toUpperCase();
    if (!["ADMIN", "SALES"].includes(roleName)) {
        return res.status(403).json({ success: false, message: "Access denied." });
    }
    const ticket = await Ticket_model_1.default.findOne({ _id: req.params.id, ...ticketScopeQuery(req.user) });
    if (!ticket)
        return res.status(404).json({ success: false, message: "Ticket not found" });
    const file = req.file;
    if (!file || !file.buffer) {
        return res.status(400).json({ success: false, message: "Missing file upload" });
    }
    (0, cloudinary_1.ensureCloudinaryConfigured)();
    const folder = String(process.env.CLOUDINARY_FOLDER || "sunce_erp/pickup").trim() || "sunce_erp/pickup";
    const ticketSeg = String(req.params?.id || "ticket")
        .trim()
        .replace(/[^a-zA-Z0-9_-]+/g, "_")
        .slice(0, 40);
    const stamp = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const publicId = `${ticketSeg}_${stamp}`;
    const uploaded = await new Promise((resolve, reject) => {
        const stream = cloudinary_1.cloudinary.uploader.upload_stream({
            folder,
            public_id: publicId,
            resource_type: "auto", // supports pdf/images
            access_mode: "public",
        }, (err, result) => {
            if (err)
                return reject(err);
            if (!result || !result.secure_url)
                return reject(new Error("Cloudinary upload failed"));
            resolve({ secure_url: String(result.secure_url) });
        });
        stream.end(file.buffer);
    });
    const urlPath = uploaded.secure_url;
    const pickup = await Logistics_model_1.default.findOneAndUpdate({ ticket: ticket._id, type: "PICKUP" }, {
        $setOnInsert: {
            ticket: ticket._id,
            type: "PICKUP",
            status: "SCHEDULED",
        },
        $addToSet: { documents: urlPath },
    }, { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true });
    ticket.logistics = pickup._id;
    await ticket.save();
    res.status(201).json({
        success: true,
        data: {
            url: (0, cloudinaryDownloadUrl_1.toCloudinaryPrivateDownloadUrl)(urlPath, { expiresInSeconds: 24 * 60 * 60 }),
            documents: (0, cloudinaryDownloadUrl_1.mapCloudinaryDocUrls)(pickup?.documents, { expiresInSeconds: 24 * 60 * 60 }),
        },
    });
});
// @desc    Get installation documents (PDF) for a ticket
// @route   GET /api/tickets/:id/installation-documents
exports.getTicketInstallationDocuments = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const ticket = await Ticket_model_1.default.findOne({ _id: req.params.id, ...ticketScopeQuery(req.user) }).select("status installation");
    if (!ticket)
        return res.status(404).json({ success: false, message: "Ticket not found" });
    res.json({
        success: true,
        data: {
            documents: mapInstallationDocsForResponse(getInstallationDocs(ticket)),
        },
    });
});
// @desc    Upload installation document (PDF) for a ticket (visible to all ticket viewers)
// @route   POST /api/tickets/:id/installation-documents
exports.uploadTicketInstallationDocument = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const ticket = await Ticket_model_1.default.findOne({ _id: req.params.id, ...ticketScopeQuery(req.user) }).select("status installation");
    if (!ticket)
        return res.status(404).json({ success: false, message: "Ticket not found" });
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
    (0, cloudinary_1.ensureCloudinaryConfigured)();
    const folder = String(process.env.CLOUDINARY_FOLDER || "sunce_erp/installation").trim() || "sunce_erp/installation";
    const ticketSeg = String(req.params?.id || "ticket")
        .trim()
        .replace(/[^a-zA-Z0-9_-]+/g, "_")
        .slice(0, 40);
    const stamp = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const publicId = `${ticketSeg}_${stamp}`;
    const uploaded = await new Promise((resolve, reject) => {
        const stream = cloudinary_1.cloudinary.uploader.upload_stream({
            folder,
            public_id: publicId,
            resource_type: "auto",
            access_mode: "public",
        }, (err, result) => {
            if (err)
                return reject(err);
            if (!result || !result.secure_url)
                return reject(new Error("Cloudinary upload failed"));
            resolve({ secure_url: String(result.secure_url) });
        });
        stream.end(file.buffer);
    });
    const roleNorm = String(req.user?.role?.name || "").trim().toUpperCase();
    const doc = {
        url: String(uploaded.secure_url),
        uploadedAt: new Date(),
        uploadedBy: req.user?._id,
        uploadedByRole: roleNorm,
        originalName: String(file.originalname || ""),
        mimeType: String(file.mimetype || ""),
        size: typeof file.size === "number" ? file.size : undefined,
    };
    ticket.installation = {
        ...ticket.installation,
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
exports.getTicketJobCard = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    let ticket = await Ticket_model_1.default.findOne({ _id: req.params.id, ...ticketScopeQuery(req.user) }).populate('jobCard');
    if (!ticket && String(req.user?.role?.name || "").trim().toUpperCase() === "ENGINEER") {
        // Legacy fallback: allow viewing job card for tickets engineer finalized.
        const raw = await Ticket_model_1.default.findById(req.params.id).populate("jobCard");
        const finalizedBy = raw?.jobCard?.engineerFinalizedBy ? String(raw.jobCard.engineerFinalizedBy) : "";
        if (finalizedBy && finalizedBy === String(req.user?._id || "")) {
            ticket = raw;
        }
    }
    if (!ticket)
        return res.status(404).json({ success: false, message: 'Ticket not found' });
    if (ticket.jobCard) {
        // Ensure defaults exist (non-destructive)
        if (!ticket.jobCard.finalTestingActivities?.length) {
            ticket.jobCard.finalTestingActivities = DEFAULT_FINAL_TESTING_ACTIVITIES;
            await ticket.jobCard.save();
        }
        return res.json({ success: true, data: ticket.jobCard });
    }
    const jobcard = await JobCard_model_1.default.create({
        ticket: ticket._id,
        customerName: ticket.customer?.company || ticket.customer?.name,
        finalTestingActivities: DEFAULT_FINAL_TESTING_ACTIVITIES,
    });
    ticket.jobCard = jobcard._id;
    await ticket.save();
    res.status(201).json({ success: true, data: jobcard });
});
function pickJobCardUpdate(input) {
    if (!input || typeof input !== 'object')
        return {};
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
        if (Object.prototype.hasOwnProperty.call(input, k))
            out[k] = input[k];
    }
    return out;
}
// @desc    Update (or create) jobcard for a ticket
// @route   PUT /api/tickets/:id/jobcard
exports.updateTicketJobCard = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const ticket = await Ticket_model_1.default.findOne({ _id: req.params.id, ...ticketScopeQuery(req.user) });
    if (!ticket)
        return res.status(404).json({ success: false, message: 'Ticket not found' });
    if (String(req.user?.role?.name || "").trim().toUpperCase() === "ENGINEER" &&
        String(ticket.status || "").toUpperCase() === "CLOSED") {
        return res.status(400).json({ success: false, message: "Closed tickets are read-only for engineers." });
    }
    let jobcard = null;
    if (ticket.jobCard) {
        jobcard = await JobCard_model_1.default.findById(ticket.jobCard);
    }
    const patch = pickJobCardUpdate(req.body);
    const requestedFinal = String(req.body?.engineerFinalStatus || "").toUpperCase().trim();
    const requestedFinalizedAt = toDateOrNull(req.body?.engineerFinalizedAt);
    const canSetFinal = requestedFinal === "REPAIRABLE" || requestedFinal === "NOT_REPAIRABLE";
    const roleName = String(req.user?.role?.name || "").trim().toUpperCase();
    const created = !jobcard;
    if (!jobcard) {
        jobcard = await JobCard_model_1.default.create({
            ticket: ticket._id,
            customerName: ticket.customer?.company || ticket.customer?.name,
            finalTestingActivities: DEFAULT_FINAL_TESTING_ACTIVITIES,
            ...patch,
        });
        ticket.jobCard = jobcard._id;
        await ticket.save();
    }
    else {
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
        jobcard.engineerFinalStatus = requestedFinal;
        jobcard.engineerFinalizedAt = requestedFinalizedAt || new Date();
        jobcard.engineerFinalizedBy = req.user?._id;
        await jobcard.save();
        // Notify sales/admin when engineer scraps the unit.
        if (requestedFinal === "NOT_REPAIRABLE") {
            try {
                const roles = await Role_model_1.default.find({ name: { $in: ["SALES", "ADMIN"] } }).select("_id name");
                const roleIds = roles.map((r) => r._id).filter(Boolean);
                const rows = await User_model_1.default.find({ role: { $in: roleIds }, isActive: true })
                    .select("email name")
                    .lean();
                const emails = Array.from(new Set((rows || [])
                    .map((u) => String(u?.email || "").trim().toLowerCase())
                    .filter(Boolean)));
                const ticketId = String(ticket.ticketId || ticket._id || "");
                const who = String(req.user?.name || req.user?._id || "");
                const diagnosis = String(jobcard.diagnosis || "").trim();
                const subject = `Ticket ${ticketId} SCRAP / NOT REPAIRABLE`;
                const text = `Engineer finalized ticket ${ticketId} as NOT REPAIRABLE (SCRAP).\n\n` +
                    `By: ${who}\n\n` +
                    (diagnosis ? `Diagnosis:\n${diagnosis}\n\n` : "") +
                    `Please proceed with next action (dispatch/closure) in ERP.`;
                await Promise.all(emails.map((to) => (0, email_1.sendEmail)({ to, subject, text }).catch((e) => {
                    console.warn("📧 Failed to notify:", to, e?.message || e);
                    return { sent: false };
                })));
            }
            catch (e) {
                console.warn("📧 Sales notification failed:", e?.message || e);
            }
        }
    }
    // If an engineer worked on this job card, keep them attached to the ticket so they
    // can see it later in their list even after sales/admin closes it.
    if (roleName === "ENGINEER" && req.user?._id) {
        const existing = Array.isArray(ticket.assignedTo) ? ticket.assignedTo : [];
        const uid = String(req.user._id);
        const has = existing.some((x) => String(x) === uid);
        if (!has) {
            ticket.assignedTo = [...existing, req.user._id];
            await ticket.save();
        }
    }
    res.status(created ? 201 : 200).json({ success: true, data: jobcard });
});
// named exports above
