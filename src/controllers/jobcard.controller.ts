import JobCard from "../models/JobCard.model";
import { asyncHandler } from "../middleware/error.middleware";

// @desc    Get jobcards
// @route   GET /api/jobcards
export const getJobCards = asyncHandler(async (req: any, res: any) => {
  const jobcards = await JobCard.find({})
    .populate({
      path: "ticket",
      populate: [{ path: "assignedTo", select: "name" }],
    })
    .populate('stages.assignedTo', 'name')
    .populate('testedBy', 'name')
    .sort('-createdAt');
  res.json({ success: true, data: jobcards });
});

// @desc    Create jobcard
// @route   POST /api/jobcards
export const createJobCard = asyncHandler(async (req: any, res: any) => {
  const jobcard = await JobCard.create({
    ...req.body,
    stages: [{ name: 'Diagnosis', status: 'PENDING' }]
  });
  await jobcard.populate('ticket stages.assignedTo testedBy', 'name');
  res.status(201).json({ success: true, data: jobcard });
});

// @desc    Add spare part
// @route   POST /api/jobcards/:id/parts
export const addPart = asyncHandler(async (req: any, res: any) => {
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
