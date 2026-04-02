"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateTicketJobCard = exports.getTicketJobCard = exports.uploadTicketPickupDocument = exports.upsertTicketPickupDetails = exports.getTicketPickupDetails = exports.updateTicket = exports.getTicket = exports.createTicket = exports.getTickets = void 0;
const Ticket_model_1 = __importDefault(require("../models/Ticket.model"));
const JobCard_model_1 = __importDefault(require("../models/JobCard.model"));
const Logistics_model_1 = __importDefault(require("../models/Logistics.model"));
const Role_model_1 = __importDefault(require("../models/Role.model"));
const User_model_1 = __importDefault(require("../models/User.model"));
const error_middleware_1 = require("../middleware/error.middleware");
const helpers_1 = require("../utils/helpers");
const cloudinary_1 = require("../config/cloudinary");
const cloudinaryDownloadUrl_1 = require("../utils/cloudinaryDownloadUrl");
const email_1 = require("../utils/email");
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
    const roleName = String(req.user?.role?.name || "").toUpperCase();
    if (roleName === 'ENGINEER') {
        // Engineers should always see their assigned tickets, and also the shared pool of
        // tickets that have reached UNDER_REPAIRED (work starts from there).
        const visibilityOr = [{ assignedTo: req.user._id }, { status: "UNDER_REPAIRED" }];
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
        const legacyMatch = req.user?.phone
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
    const ticketsQuery = Ticket_model_1.default.find(query)
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
    const roleName = String(user?.role?.name || "").toUpperCase();
    if (roleName === 'ENGINEER') {
        return { $or: [{ assignedTo: user._id }, { status: "UNDER_REPAIRED" }] };
    }
    if (roleName === 'CUSTOMER') {
        const legacyMatch = user?.phone
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
    'DISPATCHED',
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
// @desc    Create ticket
// @route   POST /api/tickets
exports.createTicket = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const roleName = String(req.user?.role?.name || "").toUpperCase();
    const body = { ...(req.body || {}) };
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
    const ticket = await Ticket_model_1.default.create({
        createdBy: req.user?._id,
        ...body,
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
// @desc    Get single ticket
// @route   GET /api/tickets/:id
exports.getTicket = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const roleName = String(req.user?.role?.name || "").toUpperCase();
    const ticketQuery = Ticket_model_1.default.findOne({ _id: req.params.id, ...ticketScopeQuery(req.user) })
        .populate('createdBy', 'email name phone')
        .populate('assignedTo', 'name')
        .populate('jobCard')
        .populate('logistics')
        .populate('statusHistory.changedBy', 'name');
    if (roleName === "CUSTOMER") {
        // Customers must never see warranty validity/dates.
        ticketQuery.select("-inverter.warrantyEnd");
    }
    const ticket = await ticketQuery;
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
    const roleNorm = String(roleName || "").toUpperCase();
    const isTicketAdmin = roleNorm === "ADMIN" || roleNorm === "SALES";
    const ALLOWED_STATUSES = new Set([
        'CREATED',
        'PICKUP_SCHEDULED',
        'IN_TRANSIT',
        'UNDER_REPAIRED',
        'DISPATCHED',
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
    if (Object.prototype.hasOwnProperty.call(body, 'status')) {
        const nextFlow = normalizeFlowStatus(body.status);
        const prevIdx = STATUS_FLOW.indexOf(prevFlow);
        const nextIdx = STATUS_FLOW.indexOf(nextFlow);
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
    }
    if (isTicketAdmin) {
        if (Object.prototype.hasOwnProperty.call(body, 'status'))
            ticket.set('status', body.status);
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
        if (Object.prototype.hasOwnProperty.call(body, 'status'))
            ticket.set('status', body.status);
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
    const roleName = String(req.user?.role?.name || "").toUpperCase();
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
    const roleName = String(req.user?.role?.name || "").toUpperCase();
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
// @desc    Get (or create) jobcard for a ticket
// @route   GET /api/tickets/:id/jobcard
exports.getTicketJobCard = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const ticket = await Ticket_model_1.default.findOne({ _id: req.params.id, ...ticketScopeQuery(req.user) }).populate('jobCard');
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
    let jobcard = null;
    if (ticket.jobCard) {
        jobcard = await JobCard_model_1.default.findById(ticket.jobCard);
    }
    const patch = pickJobCardUpdate(req.body);
    const requestedFinal = String(req.body?.engineerFinalStatus || "").toUpperCase().trim();
    const canSetFinal = requestedFinal === "REPAIRABLE" || requestedFinal === "NOT_REPAIRABLE";
    const roleName = String(req.user?.role?.name || "").toUpperCase();
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
        jobcard.engineerFinalizedAt = new Date();
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
    res.status(created ? 201 : 200).json({ success: true, data: jobcard });
});
// named exports above
