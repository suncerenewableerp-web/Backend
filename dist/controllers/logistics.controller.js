"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduleDispatch = exports.getLogisticsByTicket = exports.schedulePickup = exports.updateTracking = exports.createLogistics = exports.getLogistics = void 0;
const Logistics_model_1 = __importDefault(require("../models/Logistics.model"));
const Ticket_model_1 = __importDefault(require("../models/Ticket.model"));
const error_middleware_1 = require("../middleware/error.middleware");
const cloudinaryDownloadUrl_1 = require("../utils/cloudinaryDownloadUrl");
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
        return {
            ...obj,
            documents: (0, cloudinaryDownloadUrl_1.mapCloudinaryDocUrls)(obj?.documents, { expiresInSeconds: 24 * 60 * 60 }),
        };
    });
    res.json({ success: true, data });
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
    const invoiceGenerated = hasOwn(req.body, "invoiceGenerated")
        ? toBoolOrNull(req.body?.invoiceGenerated)
        : null;
    const paymentDone = hasOwn(req.body, "paymentDone") ? toBoolOrNull(req.body?.paymentDone) : null;
    if (!dispatchDate) {
        return res.status(400).json({ success: false, message: "dispatchDate is required" });
    }
    const ticket = await Ticket_model_1.default.findById(ticketId);
    if (!ticket)
        return res.status(404).json({ success: false, message: "Ticket not found" });
    if (!["UNDER_REPAIRED", "DISPATCHED"].includes(String(ticket.status || ""))) {
        return res.status(400).json({
            success: false,
            message: "Dispatch is allowed only when the ticket is UNDER_REPAIRED or DISPATCHED.",
        });
    }
    const setPatch = {
        type: "DELIVERY",
        status: "IN_TRANSIT",
        "pickupDetails.scheduledDate": dispatchDate,
        "pickupDetails.pickupLocation": dispatchLocation,
        "courierDetails.courierName": courierName,
        "courierDetails.lrNumber": lrNumber,
    };
    if (invoiceGenerated !== null)
        setPatch["billing.invoiceGenerated"] = invoiceGenerated;
    if (paymentDone !== null)
        setPatch["billing.paymentDone"] = paymentDone;
    const logistics = await Logistics_model_1.default.findOneAndUpdate({ ticket: ticket._id, type: "DELIVERY" }, {
        $set: {
            ...setPatch,
        },
    }, { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }).populate("ticket");
    // Link latest logistics to ticket (single reference in model)
    ticket.logistics = logistics._id;
    // Move ticket in flow if dispatch happens after repair
    if (ticket.status === "UNDER_REPAIRED") {
        ticket.status = "DISPATCHED";
        ticket.statusHistory.push({ status: ticket.status, changedBy: req.user._id });
    }
    await ticket.save();
    res.status(201).json({ success: true, data: logistics });
});
