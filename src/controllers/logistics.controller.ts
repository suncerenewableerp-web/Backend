import Logistics from "../models/Logistics.model";
import Ticket from "../models/Ticket.model";
import { asyncHandler } from "../middleware/error.middleware";
import { mapCloudinaryDocUrls } from "../utils/cloudinaryDownloadUrl";

// @desc    Get all logistics
// @route   GET /api/logistics
export const getLogistics = asyncHandler(async (req: any, res: any) => {
  const logistics = await Logistics.find({})
    .populate('ticket')
    .sort('-createdAt');
  res.json({ success: true, data: logistics });
});

// @desc    Create logistics record
// @route   POST /api/logistics
export const createLogistics = asyncHandler(async (req: any, res: any) => {
  const logistics = await Logistics.create(req.body);
  await logistics.populate('ticket');
  res.status(201).json({ success: true, data: logistics });
});

// @desc    Update tracking
// @route   PUT /api/logistics/:id
export const updateTracking = asyncHandler(async (req: any, res: any) => {
  const logistics = await Logistics.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true, runValidators: true }
  ).populate('ticket');
  res.json({ success: true, data: logistics });
});

function toDateOrNull(v) {
  if (!v) return null;
  const d = new Date(v);
  const t = d.getTime();
  if (Number.isNaN(t)) return null;
  return d;
}

function hasOwn(obj: any, key: string) {
  return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
}

function toBoolOrNull(v: any): boolean | null {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v === 1 ? true : v === 0 ? false : null;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true" || s === "1" || s === "yes" || s === "y") return true;
    if (s === "false" || s === "0" || s === "no" || s === "n") return false;
  }
  return null;
}

// @desc    Schedule pickup for a ticket (creates/updates pickup logistics)
// @route   POST /api/logistics/schedule-pickup
export const schedulePickup = asyncHandler(async (req: any, res: any) => {
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

  const ticket = await Ticket.findById(ticketId);
  if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });

  const logistics = await Logistics.findOneAndUpdate(
    { ticket: ticket._id, type: 'PICKUP' },
    {
      $set: {
        type: 'PICKUP',
        status: 'SCHEDULED',
        'pickupDetails.scheduledDate': pickupDate,
        'pickupDetails.pickupLocation': pickupLocation,
        'courierDetails.courierName': courierName,
        'courierDetails.lrNumber': lrNumber,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
  ).populate('ticket');

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
export const getLogisticsByTicket = asyncHandler(async (req: any, res: any) => {
  const ticketId = String(req.params?.ticketId || "").trim();
  if (!ticketId) {
    return res.status(400).json({ success: false, message: "ticketId is required" });
  }

  const ticket = await Ticket.findById(ticketId);
  if (!ticket) return res.status(404).json({ success: false, message: "Ticket not found" });

  const logistics = await Logistics.find({ ticket: ticket._id })
    .sort("-updatedAt")
    .limit(50);

  const data = logistics.map((row: any) => {
    const obj = typeof row?.toObject === "function" ? row.toObject() : row;
    return {
      ...obj,
      documents: mapCloudinaryDocUrls(obj?.documents, { expiresInSeconds: 24 * 60 * 60 }),
    };
  });

  res.json({ success: true, data });
});

// @desc    Under-dispatch review (invoice + payment flags) for a ticket
// @route   POST /api/logistics/under-dispatch
export const saveUnderDispatch = asyncHandler(async (req: any, res: any) => {
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

  if (invoiceGenerated === null && paymentDone === null) {
    return res.status(400).json({
      success: false,
      message: "At least one field is required: invoiceGenerated or paymentDone.",
    });
  }

  const ticket = await Ticket.findById(ticketId);
  if (!ticket) return res.status(404).json({ success: false, message: "Ticket not found" });
  if (String(ticket.status || "").toUpperCase() === "CLOSED") {
    return res.status(400).json({ success: false, message: "Closed tickets cannot be updated." });
  }

  const allowed = ["UNDER_REPAIRED", "UNDER_DISPATCH", "DISPATCHED"];
  if (!allowed.includes(String(ticket.status || "").toUpperCase())) {
    return res.status(400).json({
      success: false,
      message: "Under-dispatch review is allowed only when the ticket is UNDER_REPAIRED, UNDER_DISPATCH or DISPATCHED.",
    });
  }

  const setPatch: Record<string, any> = {};
  if (invoiceGenerated !== null) setPatch["billing.invoiceGenerated"] = invoiceGenerated;
  if (paymentDone !== null) setPatch["billing.paymentDone"] = paymentDone;

  // Avoid Mongo "Updating the path 'type' would create a conflict at 'type'" errors
  // that can happen with upsert + type filter across different mongoose/mongodb versions.
  let logistics: any = await Logistics.findOne({ ticket: ticket._id, type: "DELIVERY" });
  if (!logistics) {
    logistics = new Logistics({ ticket: ticket._id, type: "DELIVERY" });
  }
  logistics.billing = logistics.billing || {};
  if (invoiceGenerated !== null) logistics.billing.invoiceGenerated = invoiceGenerated;
  if (paymentDone !== null) logistics.billing.paymentDone = paymentDone;
  await logistics.save();
  await logistics.populate("ticket");

  ticket.logistics = logistics._id;

  if (String(ticket.status || "").toUpperCase() === "UNDER_REPAIRED") {
    ticket.status = "UNDER_DISPATCH";
    ticket.statusHistory.push({ status: ticket.status, changedBy: req.user._id });
  }

  await ticket.save();

  res.status(201).json({
    success: true,
    data: {
      invoiceGenerated: Boolean(logistics?.billing?.invoiceGenerated),
      paymentDone: Boolean(logistics?.billing?.paymentDone),
    },
  });
});

// @desc    Schedule dispatch for a ticket (creates/updates delivery logistics)
// @route   POST /api/logistics/schedule-dispatch
export const scheduleDispatch = asyncHandler(async (req: any, res: any) => {
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

  const ticket = await Ticket.findById(ticketId);
  if (!ticket) return res.status(404).json({ success: false, message: "Ticket not found" });

  if (!["UNDER_DISPATCH", "DISPATCHED"].includes(String(ticket.status || "").toUpperCase())) {
    return res.status(400).json({
      success: false,
      message: "Dispatch is allowed only when the ticket is UNDER_DISPATCH or DISPATCHED.",
    });
  }

  const setPatch: Record<string, any> = {
    status: "IN_TRANSIT",
    "pickupDetails.scheduledDate": dispatchDate,
    "pickupDetails.pickupLocation": dispatchLocation,
    "courierDetails.courierName": courierName,
    "courierDetails.lrNumber": lrNumber,
  };

  // Avoid upsert update-path conflicts on `type` by using find/create + save.
  let logistics: any = await Logistics.findOne({ ticket: ticket._id, type: "DELIVERY" });
  if (!logistics) {
    logistics = new Logistics({ ticket: ticket._id, type: "DELIVERY" });
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

  res.status(201).json({ success: true, data: logistics });
});
