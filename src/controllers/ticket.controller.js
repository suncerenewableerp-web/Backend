const Ticket = require('../models/Ticket.model');
const JobCard = require('../models/JobCard.model');
const { asyncHandler } = require('../middleware/error.middleware');
const { getPagination } = require('../utils/helpers');
const { calcSLAStatus } = require('../utils/helpers');

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
const getTickets = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status, priority, slaStatus, search } = req.query;
  const { skip, limit: lim } = getPagination(page, limit);
  
  const query = { 
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
    if (req.user.company) query['customer.company'] = req.user.company;
    else query['customer.name'] = req.user.name;
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

// @desc    Create ticket
// @route   POST /api/tickets
const createTicket = asyncHandler(async (req, res) => {
  const ticket = await Ticket.create({
    ...req.body,
    statusHistory: [{ status: 'CREATED', changedBy: req.user._id }]
  });
  
  await ticket.populate('statusHistory.changedBy', 'name');
  res.status(201).json({ success: true, data: ticket });
});

// @desc    Get single ticket
// @route   GET /api/tickets/:id
const getTicket = asyncHandler(async (req, res) => {
  const ticket = await Ticket.findById(req.params.id)
    .populate('assignedTo', 'name')
    .populate('jobCard')
    .populate('logistics')
    .populate('statusHistory.changedBy', 'name');
    
  if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });
  res.json({ success: true, data: ticket });
});

// @desc    Update ticket
// @route   PUT /api/tickets/:id
const updateTicket = asyncHandler(async (req, res) => {
  const ticket = await Ticket.findByIdAndUpdate(
    req.params.id,
    {
      ...req.body,
      $push: { statusHistory: { 
        status: req.body.status, 
        changedBy: req.user._id 
      } }
    },
    { new: true, runValidators: true }
  ).populate('statusHistory.changedBy', 'name');
  
  res.json({ success: true, data: ticket });
});

// @desc    Get (or create) jobcard for a ticket
// @route   GET /api/tickets/:id/jobcard
const getTicketJobCard = asyncHandler(async (req, res) => {
  const ticket = await Ticket.findById(req.params.id).populate('jobCard');
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
const updateTicketJobCard = asyncHandler(async (req, res) => {
  const ticket = await Ticket.findById(req.params.id);
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

module.exports = {
  getTickets,
  createTicket,
  getTicket,
  updateTicket,
  getTicketJobCard,
  updateTicketJobCard,
};
