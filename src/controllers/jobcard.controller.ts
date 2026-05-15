import JobCard from "../models/JobCard.model";
import Ticket from "../models/Ticket.model";
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

// @desc    Delete jobcard (admin-only)
// @route   DELETE /api/jobcards/:id
export const deleteJobCard = asyncHandler(async (req: any, res: any) => {
  const roleName = String(req.user?.role?.name || "").trim().toUpperCase();
  if (roleName !== "ADMIN") {
    return res.status(403).json({ success: false, message: "Access denied." });
  }

  const id = String(req.params?.id || "").trim();
  if (!id) return res.status(400).json({ success: false, message: "id is required" });

  const jobcard: any = await JobCard.findById(id).select("_id ticket").lean();
  if (!jobcard) return res.status(404).json({ success: false, message: "Job card not found" });

  const ticketId = String(jobcard.ticket || "");
  await JobCard.deleteOne({ _id: jobcard._id });
  if (ticketId) {
    await Ticket.updateOne({ _id: ticketId, jobCard: jobcard._id }, { $unset: { jobCard: 1 } }).catch(() => {});
  }

  res.json({ success: true, message: "Job card deleted", data: { id: String(jobcard._id) } });
});
