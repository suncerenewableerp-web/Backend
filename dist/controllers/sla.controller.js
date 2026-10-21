"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSLAOverview = void 0;
const Ticket_model_1 = __importDefault(require("../models/Ticket.model"));
const error_middleware_1 = require("../middleware/error.middleware");
async function ticketScopeQuery(user) {
    const roleName = user?.role?.name;
    // ENGINEER is unscoped, matching the tickets list and the dashboard. The SLA Monitor tab
    // is on the engineer's nav (the role carries `sla:view`), so scoping it here made that
    // visible tab report a smaller total than Admin's for the same period.
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
    const tickets = await Ticket_model_1.default.find(await ticketScopeQuery(req.user)).select('createdAt ticketId slaStatus');
    const stats = {
        total: tickets.length,
        ok: tickets.filter(t => t.slaStatus === 'OK').length,
        warning: tickets.filter(t => t.slaStatus === 'WARNING').length,
        breached: tickets.filter(t => t.slaStatus === 'BREACHED').length
    };
    res.json({ success: true, data: stats });
});
