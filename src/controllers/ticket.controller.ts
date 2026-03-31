import Ticket from "../models/Ticket.model";
import JobCard from "../models/JobCard.model";
import Logistics from "../models/Logistics.model";
import { asyncHandler } from "../middleware/error.middleware";
import { getPagination } from "../utils/helpers";

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
    query.assignedTo = req.user._id;
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
  const roleName = user?.role?.name;
  if (roleName === 'ENGINEER') {
    return { assignedTo: user._id };
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
  'DISPATCHED',
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

// @desc    Create ticket
// @route   POST /api/tickets
export const createTicket = asyncHandler(async (req: any, res: any) => {
  const roleName = String(req.user?.role?.name || "").toUpperCase();
  const body = { ...(req.body || {}) };

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
      // Keep safe defaults for company/phone (but don't overwrite if provided).
      ...(inputCustomer?.company ? {} : req.user.company ? { company: req.user.company } : {}),
      ...(inputCustomer?.phone ? {} : req.user.phone ? { phone: req.user.phone } : {}),
    };
  }

  const ticket = await Ticket.create({
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
export const getTicket = asyncHandler(async (req: any, res: any) => {
  const roleName = String(req.user?.role?.name || "").toUpperCase();
  const ticketQuery = Ticket.findOne({ _id: req.params.id, ...ticketScopeQuery(req.user) })
    .populate('assignedTo', 'name')
    .populate('jobCard')
    .populate('logistics')
    .populate('statusHistory.changedBy', 'name');

  if (roleName === "CUSTOMER") {
    // Customers must never see warranty validity/dates.
    ticketQuery.select("-inverter.warrantyEnd");
  }

  const ticket = await ticketQuery;
    
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
    if (Object.prototype.hasOwnProperty.call(body, 'status')) ticket.set('status', body.status);
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
    if (Object.prototype.hasOwnProperty.call(body, 'status')) ticket.set('status', body.status);
  }

  if (ticket.status && ticket.status !== prevStatus) {
    ticket.statusHistory.push({
      status: ticket.status,
      changedBy: req.user._id,
    });
  }

  await ticket.save();
  await ticket.populate('statusHistory.changedBy', 'name');
  await ticket.populate('logistics');
  res.json({ success: true, data: ticket });
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
      documents: Array.isArray(pickup?.documents) ? pickup?.documents : [],
    },
  });
});

// @desc    Upsert pickup details for a ticket (customer input)
// @route   POST /api/tickets/:id/pickup-details
export const upsertTicketPickupDetails = asyncHandler(async (req: any, res: any) => {
  const roleName = String(req.user?.role?.name || "").toUpperCase();
  if (roleName !== "CUSTOMER") {
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
      documents: Array.isArray(pickup?.documents) ? pickup?.documents : [],
    },
  });
});

// @desc    Upload pickup document (PDF/Image) for a ticket
// @route   POST /api/tickets/:id/pickup-documents
export const uploadTicketPickupDocument = asyncHandler(async (req: any, res: any) => {
  const roleName = String(req.user?.role?.name || "").toUpperCase();
  if (!["CUSTOMER", "ADMIN", "SALES"].includes(roleName)) {
    return res.status(403).json({ success: false, message: "Access denied." });
  }

  const ticket = await Ticket.findOne({ _id: req.params.id, ...ticketScopeQuery(req.user) });
  if (!ticket) return res.status(404).json({ success: false, message: "Ticket not found" });

  const file = req.file;
  if (!file || !file.filename) {
    return res.status(400).json({ success: false, message: "Missing file upload" });
  }

  const urlPath = `/uploads/pickup/${file.filename}`;

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
      url: urlPath,
      documents: Array.isArray(pickup?.documents) ? pickup.documents : [],
    },
  });
});

// @desc    Get (or create) jobcard for a ticket
// @route   GET /api/tickets/:id/jobcard
export const getTicketJobCard = asyncHandler(async (req: any, res: any) => {
  const ticket: any = await Ticket.findOne({ _id: req.params.id, ...ticketScopeQuery(req.user) }).populate('jobCard');
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

  let jobcard = null;
  if (ticket.jobCard) {
    jobcard = await JobCard.findById(ticket.jobCard);
  }

  const patch = pickJobCardUpdate(req.body);

  if (!jobcard) {
    jobcard = await JobCard.create({
      ticket: ticket._id,
      customerName: ticket.customer?.company || ticket.customer?.name,
      finalTestingActivities: DEFAULT_FINAL_TESTING_ACTIVITIES,
      ...patch,
    });
    ticket.jobCard = jobcard._id;
    await ticket.save();
    return res.status(201).json({ success: true, data: jobcard });
  }

  jobcard.set(patch);

  // Ensure defaults are present if client sends empty list unintentionally
  if (!jobcard.finalTestingActivities?.length) {
    jobcard.finalTestingActivities = DEFAULT_FINAL_TESTING_ACTIVITIES;
  }

  await jobcard.save();
  res.json({ success: true, data: jobcard });
});
// named exports above
