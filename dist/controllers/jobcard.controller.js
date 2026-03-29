"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.addPart = exports.createJobCard = exports.getJobCards = void 0;
const JobCard_model_1 = __importDefault(require("../models/JobCard.model"));
const error_middleware_1 = require("../middleware/error.middleware");
// @desc    Get jobcards
// @route   GET /api/jobcards
exports.getJobCards = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const jobcards = await JobCard_model_1.default.find({})
        .populate('ticket')
        .populate('stages.assignedTo', 'name')
        .populate('testedBy', 'name')
        .sort('-createdAt');
    res.json({ success: true, data: jobcards });
});
// @desc    Create jobcard
// @route   POST /api/jobcards
exports.createJobCard = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const jobcard = await JobCard_model_1.default.create({
        ...req.body,
        stages: [{ name: 'Diagnosis', status: 'PENDING' }]
    });
    await jobcard.populate('ticket stages.assignedTo testedBy', 'name');
    res.status(201).json({ success: true, data: jobcard });
});
// @desc    Add spare part
// @route   POST /api/jobcards/:id/parts
exports.addPart = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const jobcard = await JobCard_model_1.default.findByIdAndUpdate(req.params.id, {
        $push: { spareParts: req.body },
        $inc: {
            'totalCost.parts': req.body.cost || 0
        }
    }, { new: true });
    res.json({ success: true, data: jobcard });
});
