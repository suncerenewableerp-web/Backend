const Logistics = require('../models/Logistics.model');
const { asyncHandler } = require('../middleware/error.middleware');

// @desc    Get all logistics
// @route   GET /api/logistics
const getLogistics = asyncHandler(async (req, res) => {
  const logistics = await Logistics.find({})
    .populate('ticket')
    .sort('-createdAt');
  res.json({ success: true, data: logistics });
});

// @desc    Create logistics record
// @route   POST /api/logistics
const createLogistics = asyncHandler(async (req, res) => {
  const logistics = await Logistics.create(req.body);
  await logistics.populate('ticket');
  res.status(201).json({ success: true, data: logistics });
});

// @desc    Update tracking
// @route   PUT /api/logistics/:id
const updateTracking = asyncHandler(async (req, res) => {
  const logistics = await Logistics.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true, runValidators: true }
  ).populate('ticket');
  res.json({ success: true, data: logistics });
});

module.exports = { getLogistics, createLogistics, updateTracking };

