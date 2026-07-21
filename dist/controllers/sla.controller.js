"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSLAOverview = void 0;
const Ticket_model_1 = __importDefault(require("../models/Ticket.model"));
const error_middleware_1 = require("../middleware/error.middleware");
const sla_1 = require("../utils/sla");
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
    // Computed from each ticket's own priority and elapsed time rather than the
    // stored slaStatus field, which nothing kept up to date.
    const config = await (0, sla_1.loadSlaConfig)();
    const tickets = await Ticket_model_1.default.find(ticketScopeQuery(req.user))
        .select('createdAt updatedAt ticketId status issue.priority statusHistory')
        .lean();
    const stats = { total: tickets.length, ok: 0, warning: 0, breached: 0 };
    for (const t of tickets) {
        const status = (0, sla_1.computeSlaStatus)({
            createdAt: t.createdAt,
            priority: t?.issue?.priority,
            config,
            closedAt: (0, sla_1.closedAtOf)(t),
        });
        if (status === 'BREACHED')
            stats.breached += 1;
        else if (status === 'WARNING')
            stats.warning += 1;
        else
            stats.ok += 1;
    }
    res.json({ success: true, data: stats });
});
