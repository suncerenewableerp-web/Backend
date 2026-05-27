import type { Request, Response } from "express";
import { asyncHandler } from "../middleware/error.middleware";
import Notification from "../models/Notification.model";

function toPositiveInt(v: any) {
  const n = typeof v === "number" ? v : Number.parseInt(String(v || ""), 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

function normalizeRole(roleName: any): string {
  return String(roleName || "").trim().toUpperCase();
}

function buildAudienceFilter(user: any) {
  const roleNorm = normalizeRole(user?.role?.name);
  if (roleNorm === "ADMIN") return {};
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
export const listNotifications = asyncHandler(async (req: Request & { user?: any }, res: Response) => {
  const limit = Math.min(toPositiveInt((req as any)?.query?.limit) || 20, 50);
  const filter = buildAudienceFilter(req.user);
  const uid = req.user?._id;

  const [items, unreadCount] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).limit(limit).lean(),
    Notification.countDocuments({ ...filter, readBy: { $ne: uid } }),
  ]);

  const mapped = (items || []).map((n: any) => {
    const read = Array.isArray(n?.readBy) && uid ? n.readBy.some((x: any) => String(x) === String(uid)) : false;
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
export const markNotificationRead = asyncHandler(async (req: Request & { user?: any }, res: Response) => {
  const id = String((req as any)?.params?.id || "").trim();
  if (!id) return res.status(400).json({ success: false, message: "Notification id is required" });

  const uid = req.user?._id;
  const filter = buildAudienceFilter(req.user);
  const roleNorm = normalizeRole(req.user?.role?.name);
  const canSeeAll = roleNorm === "ADMIN";

  const doc = await Notification.findOne({
    _id: id,
    ...(canSeeAll ? {} : filter),
  }).select("_id");
  if (!doc) return res.status(404).json({ success: false, message: "Notification not found" });

  await Notification.updateOne({ _id: id }, { $addToSet: { readBy: uid } }).catch(() => {});
  res.json({ success: true, data: { id } });
});

// @desc    Mark all relevant notifications as read (for current user)
// @route   POST /api/notifications/read-all
export const markAllNotificationsRead = asyncHandler(async (req: Request & { user?: any }, res: Response) => {
  const uid = req.user?._id;
  const filter = buildAudienceFilter(req.user);
  await Notification.updateMany(
    { ...filter, readBy: { $ne: uid } },
    { $addToSet: { readBy: uid } },
  );
  res.json({ success: true, data: { ok: true } });
});

