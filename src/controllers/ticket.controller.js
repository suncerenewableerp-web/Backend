const Ticket = require('../models/Ticket.model');
const { asyncHandler } = require('../middleware/error.middleware');
const { getPagination } = require('../utils/helpers');
const { calcSLAStatus } = require('../utils/helpers');

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

module.exports = { getTickets, createTicket, getTicket, updateTicket };
