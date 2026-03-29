"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSLAOverview = void 0;
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
// @desc    Get SLA overview
// @route   GET /api/sla
exports.getSLAOverview = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const tickets = await Ticket_model_1.default.find(ticketScopeQuery(req.user)).select('createdAt ticketId slaStatus');
    const stats = {
        total: tickets.length,
        ok: tickets.filter(t => t.slaStatus === 'OK').length,
        warning: tickets.filter(t => t.slaStatus === 'WARNING').length,
        breached: tickets.filter(t => t.slaStatus === 'BREACHED').length
    };
    res.json({ success: true, data: stats });
});
