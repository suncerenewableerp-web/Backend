"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getApprovedDispatchApprovals = exports.getPendingDispatchApprovals = exports.scheduleDispatch = exports.rejectDispatch = exports.approveDispatch = exports.saveUnderDispatch = exports.uploadUnderDispatchProof = exports.getLogisticsByTicket = exports.schedulePickup = exports.updateTracking = exports.createLogistics = exports.getLogistics = void 0;
const Logistics_model_1 = __importDefault(require("../models/Logistics.model"));
const Ticket_model_1 = __importDefault(require("../models/Ticket.model"));
const JobCard_model_1 = __importDefault(require("../models/JobCard.model"));
const Role_model_1 = __importDefault(require("../models/Role.model"));
const User_model_1 = __importDefault(require("../models/User.model"));
const Notification_model_1 = __importDefault(require("../models/Notification.model"));
const error_middleware_1 = require("../middleware/error.middleware");
const cloudinaryDownloadUrl_1 = require("../utils/cloudinaryDownloadUrl");
const cloudinary_1 = require("../config/cloudinary");
const email_1 = require("../utils/email");
// @desc    Get all logistics
// @route   GET /api/logistics
exports.getLogistics = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const logistics = await Logistics_model_1.default.find({})
        .populate('ticket')
        .sort('-createdAt');
    res.json({ success: true, data: logistics });
});
// @desc    Create logistics record
// @route   POST /api/logistics
exports.createLogistics = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const logistics = await Logistics_model_1.default.create(req.body);
    await logistics.populate('ticket');
    res.status(201).json({ success: true, data: logistics });
});
// @desc    Update tracking
// @route   PUT /api/logistics/:id
exports.updateTracking = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const logistics = await Logistics_model_1.default.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true }).populate('ticket');
    res.json({ success: true, data: logistics });
});
function toDateOrNull(v) {
    if (!v)
        return null;
    const d = new Date(v);
    const t = d.getTime();
    if (Number.isNaN(t))
        return null;
    return d;
}
function hasOwn(obj, key) {
    return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
}
function toBoolOrNull(v) {
    if (typeof v === "boolean")
        return v;
    if (typeof v === "number")
        return v === 1 ? true : v === 0 ? false : null;
    if (typeof v === "string") {
        const s = v.trim().toLowerCase();
        if (s === "true" || s === "1" || s === "yes" || s === "y")
            return true;
        if (s === "false" || s === "0" || s === "no" || s === "n")
            return false;
    }
    return null;
}
function normalizeRemark(input) {
    const raw = String(input || "").trim();
    if (!raw)
        return "";
    return raw.replace(/\s+/g, " ").trim().slice(0, 500);
}
function toIdString(v) {
    if (!v)
        return "";
    if (typeof v === "string")
        return v;
    if (typeof v === "object" && v?._id)
        return String(v._id);
    return String(v);
}
async function getEngineerFinalStatusForTicket(ticket) {
    const jobCardId = toIdString(ticket?.jobCard);
    if (!jobCardId)
        return "";
    const jc = await JobCard_model_1.default.findById(jobCardId).select("engineerFinalStatus").lean();
    return String(jc?.engineerFinalStatus || "").toUpperCase().trim();
}
function uniqIds(ids) {
    const out = [];
    const seen = new Set();
    for (const v of ids || []) {
        const s = toIdString(v).trim();
        if (!s || seen.has(s))
            continue;
        seen.add(s);
        out.push(s);
    }
    return out;
}
async function safeCreateNotification(input) {
    try {
        const targetRoles = uniqIds((input.targetRoles || []).map((r) => String(r || "").trim().toUpperCase())).filter(Boolean);
        const targetUsers = uniqIds(input.targetUsers || []);
        await Notification_model_1.default.create({
            title: input.title,
            message: input.message || "",
            kind: input.kind || "",
            href: input.href || "",
            meta: input.meta ?? null,
            ...(targetRoles.length ? { targetRoles } : {}),
            ...(targetUsers.length ? { targetUsers } : {}),
        });
    }
    catch {
        // never block core workflows
    }
}
// @desc    Schedule pickup for a ticket (creates/updates pickup logistics)
// @route   POST /api/logistics/schedule-pickup
exports.schedulePickup = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const roleName = req.user?.role?.name;
    if (roleName !== 'ADMIN' && roleName !== 'SALES') {
        return res.status(403).json({ success: false, message: 'Access denied.' });
    }
    const ticketId = String(req.body?.ticketId || '').trim();
    if (!ticketId) {
        return res.status(400).json({ success: false, message: 'ticketId is required' });
    }
    const pickupDate = toDateOrNull(req.body?.pickupDate);
    const courierName = String(req.body?.courierName || '').trim();
    const lrNumber = String(req.body?.lrNumber || '').trim();
    const pickupLocation = String(req.body?.pickupLocation || '').trim();
    if (!pickupDate) {
        return res.status(400).json({ success: false, message: 'pickupDate is required' });
    }
    const ticket = await Ticket_model_1.default.findById(ticketId);
    if (!ticket)
        return res.status(404).json({ success: false, message: 'Ticket not found' });
    const logistics = await Logistics_model_1.default.findOneAndUpdate({ ticket: ticket._id, type: 'PICKUP' }, {
        $set: {
            type: 'PICKUP',
            status: 'SCHEDULED',
            'pickupDetails.scheduledDate': pickupDate,
            'pickupDetails.pickupLocation': pickupLocation,
            'courierDetails.courierName': courierName,
            'courierDetails.lrNumber': lrNumber,
        },
    }, { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }).populate('ticket');
    // Link latest pickup logistics to ticket (single reference in model)
    ticket.logistics = logistics._id;
    // Move ticket in flow if still in CREATED
    if (ticket.status === 'CREATED') {
        ticket.status = 'PICKUP_SCHEDULED';
        ticket.statusHistory.push({ status: ticket.status, changedBy: req.user._id });
    }
    await ticket.save();
    void safeCreateNotification({
        title: "Pickup Scheduled",
        message: `${String(ticket.ticketId || "Ticket")} pickup scheduled`.slice(0, 500),
        kind: "PICKUP_SCHEDULED",
        meta: { ticketDbId: String(ticket._id), ticketId: String(ticket.ticketId || "") },
        targetRoles: ["ADMIN"],
        targetUsers: [
            ticket?.createdBy,
            ticket?.salesAssignee,
            ...(Array.isArray(ticket?.assignedTo) ? ticket.assignedTo : []),
        ],
    });
    res.status(201).json({ success: true, data: logistics });
});
// @desc    Get logistics records for a ticket (pickup + delivery)
// @route   GET /api/logistics/ticket/:ticketId
exports.getLogisticsByTicket = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const ticketId = String(req.params?.ticketId || "").trim();
    if (!ticketId) {
        return res.status(400).json({ success: false, message: "ticketId is required" });
    }
    const ticket = await Ticket_model_1.default.findById(ticketId);
    if (!ticket)
        return res.status(404).json({ success: false, message: "Ticket not found" });
    const logistics = await Logistics_model_1.default.find({ ticket: ticket._id })
        .sort("-updatedAt")
        .limit(50);
    const data = logistics.map((row) => {
        const obj = typeof row?.toObject === "function" ? row.toObject() : row;
        const proofUrl = obj?.billing?.proofDocument?.url ? String(obj.billing.proofDocument.url) : "";
        return {
            ...obj,
            documents: (0, cloudinaryDownloadUrl_1.mapCloudinaryDocUrls)(obj?.documents, { expiresInSeconds: 24 * 60 * 60 }),
            billing: {
                ...(obj?.billing || {}),
                ...(proofUrl
                    ? {
                        proofDocument: {
                            ...(obj?.billing?.proofDocument || {}),
                            url: (0, cloudinaryDownloadUrl_1.toCloudinaryPrivateDownloadUrl)(proofUrl, { expiresInSeconds: 24 * 60 * 60 }),
                        },
                    }
                    : {}),
            },
        };
    });
    res.json({ success: true, data });
});
// @desc    Upload billing proof PDF for under-dispatch review (Sales/Admin)
// @route   POST /api/logistics/under-dispatch-proof
exports.uploadUnderDispatchProof = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const roleName = req.user?.role?.name;
    if (roleName !== "ADMIN" && roleName !== "SALES") {
        return res.status(403).json({ success: false, message: "Access denied." });
    }
    const ticketId = String(req.body?.ticketId || "").trim();
    if (!ticketId) {
        return res.status(400).json({ success: false, message: "ticketId is required" });
    }
    const ticket = await Ticket_model_1.default.findById(ticketId);
    if (!ticket)
        return res.status(404).json({ success: false, message: "Ticket not found" });
    if (String(ticket.status || "").toUpperCase() === "CLOSED") {
        return res.status(400).json({ success: false, message: "Closed tickets cannot be updated." });
    }
    const allowed = ["UNDER_REPAIRED", "UNDER_DISPATCH", "DISPATCHED", "INSTALLATION_DONE"];
    if (!allowed.includes(String(ticket.status || "").toUpperCase())) {
        return res.status(400).json({
            success: false,
            message: "Billing proof can be uploaded only when the ticket is UNDER_REPAIRED, UNDER_DISPATCH, DISPATCHED or INSTALLATION_DONE.",
        });
    }
    const file = req.file;
    if (!file || !file.buffer) {
        return res.status(400).json({ success: false, message: "Missing file upload" });
    }
    const hasRemark = Object.prototype.hasOwnProperty.call(req.body || {}, "remark");
    const remark = hasRemark ? normalizeRemark(req.body?.remark) : "";
    (0, cloudinary_1.ensureCloudinaryConfigured)();
    const base = String(process.env.CLOUDINARY_FOLDER || "sunce_erp").trim() || "sunce_erp";
    const folder = `${base.replace(/\/+$/, "")}/billing_proofs`;
    const ticketSeg = String(ticketId || "ticket")
        .trim()
        .replace(/[^a-zA-Z0-9_-]+/g, "_")
        .slice(0, 40);
    const stamp = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const publicId = `${ticketSeg}_${stamp}`;
    const uploaded = await new Promise((resolve, reject) => {
        const stream = cloudinary_1.cloudinary.uploader.upload_stream({ folder, public_id: publicId, resource_type: "auto", access_mode: "public" }, (err, result) => {
            if (err)
                return reject(err);
            if (!result || !result.secure_url)
                return reject(new Error("Cloudinary upload failed"));
            resolve({ secure_url: String(result.secure_url) });
        });
        stream.end(file.buffer);
    });
    let logistics = await Logistics_model_1.default.findOne({ ticket: ticket._id, type: "DELIVERY" });
    if (!logistics)
        logistics = new Logistics_model_1.default({ ticket: ticket._id, type: "DELIVERY" });
    logistics.billing = logistics.billing || {};
    const roleNorm = String(roleName || "").toUpperCase();
    logistics.billing.proofDocument = {
        url: String(uploaded.secure_url),
        uploadedAt: new Date(),
        uploadedBy: req.user?._id,
        uploadedByRole: roleNorm,
        originalName: String(file.originalname || ""),
        mimeType: String(file.mimetype || ""),
        size: typeof file.size === "number" ? file.size : undefined,
    };
    if (hasRemark)
        logistics.billing.salesRemark = remark;
    // New proof upload means Sales can re-request approval; clear any previous rejection.
    const wasRejected = Boolean(logistics?.billing?.dispatchRejected);
    logistics.billing.dispatchRejected = false;
    logistics.billing.dispatchRejectedAt = undefined;
    logistics.billing.dispatchRejectedBy = undefined;
    logistics.billing.dispatchRejectionRemark = "";
    // Business expectation: when Sales uploads proof, treat it as "forwarded for approval"
    // so it shows up in the Admin approval counter even if the user saved billing flags earlier.
    if (roleNorm === "SALES" && !Boolean(logistics?.billing?.dispatchApproved)) {
        if (!logistics.billing.dispatchApprovalRequestedAt || wasRejected) {
            logistics.billing.dispatchApprovalRequestedAt = new Date();
            logistics.billing.dispatchApprovalRequestedBy = req.user?._id;
        }
        if (wasRejected) {
            logistics.billing.dispatchApprovalRemark = "";
        }
    }
    await logistics.save();
    ticket.logistics = logistics._id;
    await ticket.save().catch(() => { });
    res.status(201).json({
        success: true,
        data: {
            proofDocument: {
                ...(logistics.billing.proofDocument || {}),
                url: (0, cloudinaryDownloadUrl_1.toCloudinaryPrivateDownloadUrl)(String(logistics.billing.proofDocument.url), {
                    expiresInSeconds: 24 * 60 * 60,
                }),
            },
            salesRemark: String(logistics.billing.salesRemark || ""),
        },
    });
});
// @desc    Under-dispatch review (invoice + payment flags) for a ticket
// @route   POST /api/logistics/under-dispatch
exports.saveUnderDispatch = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const roleName = req.user?.role?.name;
    if (roleName !== "ADMIN" && roleName !== "SALES") {
        return res.status(403).json({ success: false, message: "Access denied." });
    }
    const ticketId = String(req.body?.ticketId || "").trim();
    if (!ticketId) {
        return res.status(400).json({ success: false, message: "ticketId is required" });
    }
    const invoiceGenerated = hasOwn(req.body, "invoiceGenerated")
        ? toBoolOrNull(req.body?.invoiceGenerated)
        : null;
    const paymentDone = hasOwn(req.body, "paymentDone") ? toBoolOrNull(req.body?.paymentDone) : null;
    const hasRemark = hasOwn(req.body, "remark");
    const remark = hasRemark ? normalizeRemark(req.body?.remark) : "";
    const requestApproval = hasOwn(req.body, "requestApproval") ? toBoolOrNull(req.body?.requestApproval) : null;
    if (invoiceGenerated === null && paymentDone === null && !hasRemark && requestApproval === null) {
        return res.status(400).json({
            success: false,
            message: "At least one field is required: invoiceGenerated, paymentDone, remark, or requestApproval.",
        });
    }
    const ticket = await Ticket_model_1.default.findById(ticketId);
    if (!ticket)
        return res.status(404).json({ success: false, message: "Ticket not found" });
    if (String(ticket.status || "").toUpperCase() === "CLOSED") {
        return res.status(400).json({ success: false, message: "Closed tickets cannot be updated." });
    }
    const allowed = ["UNDER_REPAIRED", "UNDER_DISPATCH", "DISPATCHED", "INSTALLATION_DONE"];
    if (!allowed.includes(String(ticket.status || "").toUpperCase())) {
        return res.status(400).json({
            success: false,
            message: "Under-dispatch review is allowed only when the ticket is UNDER_REPAIRED, UNDER_DISPATCH, DISPATCHED or INSTALLATION_DONE.",
        });
    }
    // Gate: once a ticket is in UNDER_REPAIRED, Sales/Admin can proceed to UNDER_DISPATCH
    // only after engineer final decision on the job card (REPAIRABLE / SCRAP).
    if (String(ticket.status || "").toUpperCase() === "UNDER_REPAIRED") {
        const final = await getEngineerFinalStatusForTicket(ticket);
        if (!["REPAIRABLE", "NOT_REPAIRABLE"].includes(final)) {
            return res.status(400).json({
                success: false,
                message: "Cannot proceed with UNDER_DISPATCH until the engineer finalizes the job card as REPAIRABLE or NOT REPAIRABLE (SCRAP).",
            });
        }
    }
    const setPatch = {};
    if (invoiceGenerated !== null)
        setPatch["billing.invoiceGenerated"] = invoiceGenerated;
    if (paymentDone !== null)
        setPatch["billing.paymentDone"] = paymentDone;
    // Avoid Mongo "Updating the path 'type' would create a conflict at 'type'" errors
    // that can happen with upsert + type filter across different mongoose/mongodb versions.
    let logistics = await Logistics_model_1.default.findOne({ ticket: ticket._id, type: "DELIVERY" });
    if (!logistics) {
        logistics = new Logistics_model_1.default({ ticket: ticket._id, type: "DELIVERY" });
    }
    logistics.billing = logistics.billing || {};
    if (invoiceGenerated !== null)
        logistics.billing.invoiceGenerated = invoiceGenerated;
    if (paymentDone !== null)
        logistics.billing.paymentDone = paymentDone;
    if (hasRemark)
        logistics.billing.salesRemark = remark;
    const roleNorm = String(roleName || "").toUpperCase();
    const readyForApproval = Boolean(logistics.billing.invoiceGenerated) && Boolean(logistics.billing.paymentDone);
    const hasProof = Boolean(logistics?.billing?.proofDocument?.url);
    const wantsApproval = roleNorm === "SALES" && requestApproval === true && !Boolean(logistics.billing.dispatchApproved);
    // Keep legacy auto-request behavior when billing is complete + proof is present.
    const autoRequest = roleNorm === "SALES" && readyForApproval && hasProof && !Boolean(logistics.billing.dispatchApproved);
    // Client requirement: allow Sales to request approval without mandatory criteria.
    const shouldRequestApproval = wantsApproval || autoRequest;
    const wasRejected = Boolean(logistics?.billing?.dispatchRejected);
    const canRequestNow = shouldRequestApproval && (!logistics.billing.dispatchApprovalRequestedAt || wasRejected);
    const newlyRequested = canRequestNow && (!logistics.billing.dispatchApprovalRequestedAt || wasRejected);
    if (shouldRequestApproval) {
        if (!logistics.billing.dispatchApprovalRequestedAt || wasRejected) {
            logistics.billing.dispatchApprovalRequestedAt = new Date();
            logistics.billing.dispatchApprovalRequestedBy = req.user?._id;
        }
        if (wasRejected) {
            logistics.billing.dispatchRejected = false;
            logistics.billing.dispatchRejectedAt = undefined;
            logistics.billing.dispatchRejectedBy = undefined;
            logistics.billing.dispatchRejectionRemark = "";
            logistics.billing.dispatchApprovalRemark = "";
        }
    }
    await logistics.save();
    await logistics.populate("ticket");
    ticket.logistics = logistics._id;
    if (String(ticket.status || "").toUpperCase() === "UNDER_REPAIRED") {
        ticket.status = "UNDER_DISPATCH";
        ticket.statusHistory.push({ status: ticket.status, changedBy: req.user._id });
    }
    await ticket.save();
    if (newlyRequested) {
        try {
            const adminRole = await Role_model_1.default.findOne({ name: "ADMIN" }).select("_id name").lean();
            const adminRoleId = adminRole?._id;
            if (adminRoleId) {
                const rows = await User_model_1.default.find({ role: adminRoleId, isActive: true })
                    .select("email name")
                    .lean();
                const emails = Array.from(new Set((rows || [])
                    .map((u) => String(u?.email || "").trim().toLowerCase())
                    .filter(Boolean)));
                if (emails.length) {
                    const ticketCode = String(ticket.ticketId || ticket._id || "");
                    const who = String(req.user?.name || req.user?._id || "");
                    const subject = `Dispatch approval requested: ${ticketCode}`;
                    const text = `Sales requested dispatch approval for ticket ${ticketCode}.\n\n` +
                        `Requested by: ${who}\n` +
                        `Invoice generated: ${Boolean(logistics?.billing?.invoiceGenerated) ? "YES" : "NO"}\n` +
                        `Payment done: ${Boolean(logistics?.billing?.paymentDone) ? "YES" : "NO"}\n\n` +
                        `Please approve dispatch in ERP to allow Sales to proceed.`;
                    await Promise.all(emails.map((to) => (0, email_1.sendEmail)({ to, subject, text }).catch(() => ({ sent: false }))));
                }
            }
        }
        catch (e) {
            console.warn("📧 Dispatch approval notification failed:", e?.message || e);
        }
    }
    res.status(201).json({
        success: true,
        data: {
            invoiceGenerated: Boolean(logistics?.billing?.invoiceGenerated),
            paymentDone: Boolean(logistics?.billing?.paymentDone),
            salesRemark: String(logistics?.billing?.salesRemark || ""),
            dispatchApprovalRequestedAt: logistics?.billing?.dispatchApprovalRequestedAt || null,
        },
    });
});
// @desc    Admin approves dispatch request for a ticket
// @route   POST /api/logistics/approve-dispatch
exports.approveDispatch = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const roleName = String(req.user?.role?.name || "").toUpperCase();
    if (roleName !== "ADMIN") {
        return res.status(403).json({ success: false, message: "Access denied." });
    }
    const ticketId = String(req.body?.ticketId || "").trim();
    if (!ticketId) {
        return res.status(400).json({ success: false, message: "ticketId is required" });
    }
    const remark = normalizeRemark(req.body?.remark);
    const ticket = await Ticket_model_1.default.findById(ticketId);
    if (!ticket)
        return res.status(404).json({ success: false, message: "Ticket not found" });
    let logistics = await Logistics_model_1.default.findOne({ ticket: ticket._id, type: "DELIVERY" });
    if (!logistics) {
        logistics = new Logistics_model_1.default({ ticket: ticket._id, type: "DELIVERY" });
    }
    // For Admin, nothing is mandatory for approval (remark/proof/flags).
    logistics.billing = logistics.billing || {};
    logistics.billing.dispatchApproved = true;
    logistics.billing.dispatchApprovedAt = new Date();
    logistics.billing.dispatchApprovedBy = req.user?._id;
    logistics.billing.dispatchApprovalRemark = remark;
    logistics.billing.dispatchRejected = false;
    logistics.billing.dispatchRejectedAt = undefined;
    logistics.billing.dispatchRejectedBy = undefined;
    logistics.billing.dispatchRejectionRemark = "";
    await logistics.save();
    ticket.logistics = logistics._id;
    await ticket.save().catch(() => { });
    void safeCreateNotification({
        title: "Dispatch Approved",
        message: `${String(ticket.ticketId || "Ticket")} dispatch approved by Admin`.slice(0, 500),
        kind: "DISPATCH_APPROVED",
        meta: { ticketDbId: String(ticket._id), ticketId: String(ticket.ticketId || ""), remark },
        targetRoles: ["SALES"],
        targetUsers: [
            logistics?.billing?.dispatchApprovalRequestedBy,
            ticket?.salesAssignee,
        ],
    });
    res.status(200).json({
        success: true,
        data: {
            dispatchApproved: true,
            dispatchApprovedAt: logistics.billing.dispatchApprovedAt,
        },
    });
});
// @desc    Admin rejects dispatch request for a ticket (remark optional)
// @route   POST /api/logistics/reject-dispatch
exports.rejectDispatch = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const roleName = String(req.user?.role?.name || "").toUpperCase();
    if (roleName !== "ADMIN") {
        return res.status(403).json({ success: false, message: "Access denied." });
    }
    const ticketId = String(req.body?.ticketId || "").trim();
    if (!ticketId) {
        return res.status(400).json({ success: false, message: "ticketId is required" });
    }
    const remark = normalizeRemark(req.body?.remark);
    const ticket = await Ticket_model_1.default.findById(ticketId);
    if (!ticket)
        return res.status(404).json({ success: false, message: "Ticket not found" });
    let logistics = await Logistics_model_1.default.findOne({ ticket: ticket._id, type: "DELIVERY" });
    if (!logistics) {
        logistics = new Logistics_model_1.default({ ticket: ticket._id, type: "DELIVERY" });
    }
    logistics.billing = logistics.billing || {};
    if (Boolean(logistics.billing.dispatchApproved)) {
        return res.status(400).json({ success: false, message: "Dispatch is already approved." });
    }
    logistics.billing.dispatchRejected = true;
    logistics.billing.dispatchRejectedAt = new Date();
    logistics.billing.dispatchRejectedBy = req.user?._id;
    logistics.billing.dispatchRejectionRemark = remark;
    // Keep approval requestedAt/by for audit, but Sales must re-request after fixing.
    await logistics.save();
    ticket.logistics = logistics._id;
    await ticket.save().catch(() => { });
    void safeCreateNotification({
        title: "Dispatch Rejected",
        message: `${String(ticket.ticketId || "Ticket")} dispatch rejected by Admin${remark ? `: ${remark}` : ""}`.slice(0, 500),
        kind: "DISPATCH_REJECTED",
        meta: { ticketDbId: String(ticket._id), ticketId: String(ticket.ticketId || ""), remark },
        targetRoles: ["SALES"],
        targetUsers: [
            logistics?.billing?.dispatchApprovalRequestedBy,
            ticket?.salesAssignee,
        ],
    });
    res.status(200).json({
        success: true,
        data: {
            dispatchRejected: true,
            dispatchRejectionRemark: remark,
        },
    });
});
// @desc    Schedule dispatch for a ticket (creates/updates delivery logistics)
// @route   POST /api/logistics/schedule-dispatch
exports.scheduleDispatch = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const roleName = req.user?.role?.name;
    if (roleName !== "ADMIN" && roleName !== "SALES") {
        return res.status(403).json({ success: false, message: "Access denied." });
    }
    const ticketId = String(req.body?.ticketId || "").trim();
    if (!ticketId) {
        return res.status(400).json({ success: false, message: "ticketId is required" });
    }
    const dispatchDate = toDateOrNull(req.body?.dispatchDate);
    const courierName = String(req.body?.courierName || "").trim();
    const lrNumber = String(req.body?.lrNumber || "").trim();
    const dispatchLocation = String(req.body?.dispatchLocation || "").trim();
    if (!dispatchDate) {
        return res.status(400).json({ success: false, message: "dispatchDate is required" });
    }
    const ticket = await Ticket_model_1.default.findById(ticketId);
    if (!ticket)
        return res.status(404).json({ success: false, message: "Ticket not found" });
    if (!["UNDER_DISPATCH", "DISPATCHED"].includes(String(ticket.status || "").toUpperCase())) {
        return res.status(400).json({
            success: false,
            message: "Dispatch is allowed only when the ticket is UNDER_DISPATCH or DISPATCHED.",
        });
    }
    // Avoid upsert update-path conflicts on `type` by using find/create + save.
    let logistics = await Logistics_model_1.default.findOne({ ticket: ticket._id, type: "DELIVERY" });
    if (!logistics) {
        logistics = new Logistics_model_1.default({ ticket: ticket._id, type: "DELIVERY" });
    }
    const roleNorm = String(roleName || "").toUpperCase();
    if (roleNorm === "SALES") {
        const approved = Boolean(logistics?.billing?.dispatchApproved);
        if (!approved) {
            return res.status(403).json({
                success: false,
                message: "Dispatch requires Admin approval. Please wait for Admin to approve the dispatch request.",
            });
        }
    }
    logistics.status = "IN_TRANSIT";
    logistics.pickupDetails = logistics.pickupDetails || {};
    logistics.pickupDetails.scheduledDate = dispatchDate;
    logistics.pickupDetails.pickupLocation = dispatchLocation;
    logistics.courierDetails = logistics.courierDetails || {};
    logistics.courierDetails.courierName = courierName;
    logistics.courierDetails.lrNumber = lrNumber;
    await logistics.save();
    await logistics.populate("ticket");
    // Link latest logistics to ticket (single reference in model)
    ticket.logistics = logistics._id;
    // Move ticket in flow after under-dispatch review
    if (String(ticket.status || "").toUpperCase() === "UNDER_DISPATCH") {
        ticket.status = "DISPATCHED";
        ticket.statusHistory.push({ status: ticket.status, changedBy: req.user._id });
    }
    await ticket.save();
    void safeCreateNotification({
        title: "Dispatch Scheduled",
        message: `${String(ticket.ticketId || "Ticket")} dispatch scheduled`.slice(0, 500),
        kind: "DISPATCH_SCHEDULED",
        meta: { ticketDbId: String(ticket._id), ticketId: String(ticket.ticketId || "") },
        targetRoles: ["ADMIN"],
        targetUsers: [
            ticket?.createdBy,
            ticket?.salesAssignee,
            ...(Array.isArray(ticket?.assignedTo) ? ticket.assignedTo : []),
        ],
    });
    res.status(201).json({ success: true, data: logistics });
});
// @desc    List tickets pending Admin dispatch approval
// @route   GET /api/logistics/pending-dispatch-approvals
exports.getPendingDispatchApprovals = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const roleName = String(req.user?.role?.name || "").toUpperCase();
    if (roleName !== "ADMIN" && roleName !== "SALES") {
        return res.status(403).json({ success: false, message: "Access denied." });
    }
    const baseQuery = {
        type: "DELIVERY",
        "billing.dispatchApprovalRequestedAt": { $exists: true, $ne: null },
        $and: [
            { $or: [{ "billing.dispatchRejected": { $exists: false } }, { "billing.dispatchRejected": false }] },
            { $or: [{ "billing.dispatchApproved": { $exists: false } }, { "billing.dispatchApproved": false }] },
        ],
    };
    // For Sales, show only their own approval requests (so they can track what they forwarded).
    if (roleName === "SALES" && req.user?._id) {
        baseQuery["billing.dispatchApprovalRequestedBy"] = req.user._id;
    }
    const rows = await Logistics_model_1.default.find(baseQuery)
        .populate("ticket", "ticketId status customer createdAt")
        .sort({ "billing.dispatchApprovalRequestedAt": -1, updatedAt: -1 })
        .limit(500);
    const pending = (rows || [])
        .map((r) => {
        const t = r?.ticket && typeof r.ticket === "object" ? r.ticket : null;
        if (!t || String(t.status || "").toUpperCase() === "CLOSED")
            return null;
        const custName = t?.customer?.name ? String(t.customer.name).trim() : "";
        const custCompany = t?.customer?.company ? String(t.customer.company).trim() : "";
        const customer = custName && custCompany ? `${custName} / ${custCompany}` : custName || custCompany || "—";
        return {
            ticketDbId: String(t?._id || ""),
            ticketId: String(t?.ticketId || ""),
            status: String(t?.status || ""),
            customer,
            requestedAt: r?.billing?.dispatchApprovalRequestedAt || null,
            invoiceGenerated: Boolean(r?.billing?.invoiceGenerated),
            paymentDone: Boolean(r?.billing?.paymentDone),
        };
    })
        .filter(Boolean);
    res.json({
        success: true,
        data: {
            count: pending.length,
            tickets: pending,
        },
    });
});
// @desc    List tickets approved by Admin for dispatch (Sales view)
// @route   GET /api/logistics/approved-dispatch-approvals
exports.getApprovedDispatchApprovals = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const roleName = String(req.user?.role?.name || "").toUpperCase();
    if (roleName !== "SALES") {
        return res.status(403).json({ success: false, message: "Access denied." });
    }
    const rows = await Logistics_model_1.default.find({
        type: "DELIVERY",
        "billing.dispatchApproved": true,
    })
        .populate("ticket", "ticketId status customer createdAt")
        .sort({ "billing.dispatchApprovedAt": -1, updatedAt: -1 })
        .limit(500);
    const approved = (rows || [])
        .map((r) => {
        const t = r?.ticket && typeof r.ticket === "object" ? r.ticket : null;
        if (!t || String(t.status || "").toUpperCase() === "CLOSED")
            return null;
        // Only show approvals that are still actionable by Sales.
        if (String(t.status || "").toUpperCase() !== "UNDER_DISPATCH")
            return null;
        const custName = t?.customer?.name ? String(t.customer.name).trim() : "";
        const custCompany = t?.customer?.company ? String(t.customer.company).trim() : "";
        const customer = custName && custCompany ? `${custName} / ${custCompany}` : custName || custCompany || "—";
        return {
            ticketDbId: String(t?._id || ""),
            ticketId: String(t?.ticketId || ""),
            status: String(t?.status || ""),
            customer,
            approvedAt: r?.billing?.dispatchApprovedAt || null,
            invoiceGenerated: Boolean(r?.billing?.invoiceGenerated),
            paymentDone: Boolean(r?.billing?.paymentDone),
        };
    })
        .filter(Boolean);
    res.json({
        success: true,
        data: {
            count: approved.length,
            tickets: approved,
        },
    });
});
