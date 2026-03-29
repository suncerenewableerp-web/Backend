"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDashboard = void 0;
const Ticket_model_1 = __importDefault(require("../models/Ticket.model"));
const error_middleware_1 = require("../middleware/error.middleware");
function ticketScopeQuery(user) {
    const roleName = user?.role?.name;
    if (roleName === "ENGINEER") {
        return { assignedTo: user._id };
    }
    if (roleName === "CUSTOMER") {
        const legacyMatch = user?.phone
            ? { "customer.phone": user.phone }
            : { "customer.name": user?.name };
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
// @desc    Dashboard KPIs
// @route   GET /api/dashboard
exports.getDashboard = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const pipeline = [
        { $match: ticketScopeQuery(req.user) },
        { $group: {
                _id: null,
                totalTickets: { $sum: 1 },
                openTickets: { $sum: { $cond: [{ $ne: ['$status', 'CLOSED'] }, 1, 0] } },
                avgResolutionDays: { $avg: { $divide: [{ $subtract: ['$updatedAt', '$createdAt'] }, 86400000] } }
            } },
        { $project: {
                _id: 0, avgResolutionDays: { $round: ['$avgResolutionDays', 1] }
            } }
    ];
    const kpis = await Ticket_model_1.default.aggregate(pipeline);
    res.json({ success: true, data: kpis[0] || {} });
});
