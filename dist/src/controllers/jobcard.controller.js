const JobCard = require('../models/JobCard.model');
const { asyncHandler } = require('../middleware/error.middleware');

// @desc    Get jobcards
// @route   GET /api/jobcards
const getJobCards = asyncHandler(async (req, res) => {
  const jobcards = await JobCard.find({})
    .populate('ticket')
    .populate('stages.assignedTo', 'name')
    .populate('testedBy', 'name')
    .sort('-createdAt');
  res.json({ success: true, data: jobcards });
});

// @desc    Create jobcard
// @route   POST /api/jobcards
const createJobCard = asyncHandler(async (req, res) => {
  const jobcard = await JobCard.create({
    ...req.body,
    stages: [{ name: 'Diagnosis', status: 'PENDING' }]
  });
  await jobcard.populate('ticket stages.assignedTo testedBy', 'name');
  res.status(201).json({ success: true, data: jobcard });
});

// @desc    Add spare part
// @route   POST /api/jobcards/:id/parts
const addPart = asyncHandler(async (req, res) => {
  const jobcard = await JobCard.findByIdAndUpdate(
    req.params.id,
    {
      $push: { spareParts: req.body },
      $inc: { 
        'totalCost.parts': req.body.cost || 0 
      }
    },
    { new: true }
  );
  res.json({ success: true, data: jobcard });
});

module.exports = { getJobCards, createJobCard, addPart };

