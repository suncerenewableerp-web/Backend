"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.markAllNotificationsRead = exports.markNotificationRead = exports.listNotifications = void 0;
const error_middleware_1 = require("../middleware/error.middleware");
const Notification_model_1 = __importDefault(require("../models/Notification.model"));
function toPositiveInt(v) {
    const n = typeof v === "number" ? v : Number.parseInt(String(v || ""), 10);
    if (!Number.isFinite(n) || n <= 0)
        return null;
    return Math.trunc(n);
}
function normalizeRole(roleName) {
    return String(roleName || "").trim().toUpperCase();
}
function buildAudienceFilter(user) {
    const roleNorm = normalizeRole(user?.role?.name);
    if (roleNorm === "ADMIN")
        return {};
    const uid = user?._id;
    return {
        $or: [
            { targetUsers: uid },
            { targetRoles: roleNorm },
            { targetRoles: "ALL" },
        ],
    };
}
// @desc    List notifications relevant to current user
// @route   GET /api/notifications?limit=20
exports.listNotifications = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const limit = Math.min(toPositiveInt(req?.query?.limit) || 20, 50);
    const filter = buildAudienceFilter(req.user);
    const uid = req.user?._id;
    const [items, unreadCount] = await Promise.all([
        Notification_model_1.default.find(filter).sort({ createdAt: -1 }).limit(limit).lean(),
        Notification_model_1.default.countDocuments({ ...filter, readBy: { $ne: uid } }),
    ]);
    const mapped = (items || []).map((n) => {
        const read = Array.isArray(n?.readBy) && uid ? n.readBy.some((x) => String(x) === String(uid)) : false;
        return {
            id: String(n?._id || ""),
            title: String(n?.title || ""),
            message: n?.message ? String(n.message) : "",
            kind: n?.kind ? String(n.kind) : "",
            href: n?.href ? String(n.href) : "",
            meta: n?.meta ?? null,
            createdAt: n?.createdAt ? new Date(n.createdAt).toISOString() : null,
            read,
        };
    });
    res.json({ success: true, data: { items: mapped, unreadCount } });
});
// @desc    Mark a single notification as read (for current user)
// @route   POST /api/notifications/:id/read
exports.markNotificationRead = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const id = String(req?.params?.id || "").trim();
    if (!id)
        return res.status(400).json({ success: false, message: "Notification id is required" });
    const uid = req.user?._id;
    const filter = buildAudienceFilter(req.user);
    const roleNorm = normalizeRole(req.user?.role?.name);
    const canSeeAll = roleNorm === "ADMIN";
    const doc = await Notification_model_1.default.findOne({
        _id: id,
        ...(canSeeAll ? {} : filter),
    }).select("_id");
    if (!doc)
        return res.status(404).json({ success: false, message: "Notification not found" });
    await Notification_model_1.default.updateOne({ _id: id }, { $addToSet: { readBy: uid } }).catch(() => { });
    res.json({ success: true, data: { id } });
});
// @desc    Mark all relevant notifications as read (for current user)
// @route   POST /api/notifications/read-all
exports.markAllNotificationsRead = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const uid = req.user?._id;
    const filter = buildAudienceFilter(req.user);
    await Notification_model_1.default.updateMany({ ...filter, readBy: { $ne: uid } }, { $addToSet: { readBy: uid } });
    res.json({ success: true, data: { ok: true } });
});
