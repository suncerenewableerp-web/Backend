import Ticket from "../models/Ticket.model";
import JobCard from "../models/JobCard.model";
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
  const roleName = req.user?.role?.name;
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

  const tickets = await Ticket.find(query)
    .populate('assignedTo', 'name')
    .populate('statusHistory.changedBy', 'name')
    .sort('-createdAt')
    .skip(skip)
    .limit(lim);
    
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

// @desc    Create ticket
// @route   POST /api/tickets
export const createTicket = asyncHandler(async (req: any, res: any) => {
  const roleName = req.user?.role?.name;
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
  res.status(201).json({ success: true, data: ticket });
});

// @desc    Get single ticket
// @route   GET /api/tickets/:id
export const getTicket = asyncHandler(async (req: any, res: any) => {
  const ticket = await Ticket.findOne({ _id: req.params.id, ...ticketScopeQuery(req.user) })
    .populate('assignedTo', 'name')
    .populate('jobCard')
    .populate('logistics')
    .populate('statusHistory.changedBy', 'name');
    
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

  if (roleName === 'SALES') {
    const allowedTop = new Set(['issue']);
    const disallowedTop = topKeys.filter((k) => !allowedTop.has(k));
    const issue = body.issue && typeof body.issue === 'object' ? body.issue : null;
    const issueKeys = issue ? Object.keys(issue) : [];
    const disallowedIssue = issueKeys.filter((k) => k !== 'description');
    if (disallowedTop.length || disallowedIssue.length) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: Sales can only update fault description.',
      });
    }
  }

  if (roleName === 'ENGINEER') {
    const allowedTop = new Set(['status']);
    const disallowedTop = topKeys.filter((k) => !allowedTop.has(k));
    if (disallowedTop.length) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: Engineers can only update ticket status.',
      });
    }
  }

  if (roleName !== 'ADMIN' && roleName !== 'SALES' && roleName !== 'ENGINEER') {
    // Customers and unknown roles should never reach here (RBAC), but keep hard guard.
    return res.status(403).json({ success: false, message: 'Access denied.' });
  }

  const prevStatus = ticket.status;

  if (roleName === 'ADMIN') {
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

  if (roleName === 'SALES') {
    if (body.issue && typeof body.issue === 'object' && Object.prototype.hasOwnProperty.call(body.issue, 'description')) {
      ticket.set('issue.description', body.issue.description);
    }
  }

  if (roleName === 'ENGINEER') {
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
