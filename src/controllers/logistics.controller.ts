import Logistics from "../models/Logistics.model";
import Ticket from "../models/Ticket.model";
import { asyncHandler } from "../middleware/error.middleware";

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
        'pickupDetails.pickupLocation': pickupLocation || ticket.customer?.address || '',
        ...(courierName ? { 'courierDetails.courierName': courierName } : {}),
        ...(lrNumber ? { 'courierDetails.lrNumber': lrNumber } : {}),
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
