import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 140 },
    message: { type: String, trim: true, maxlength: 500 },
    kind: { type: String, trim: true, maxlength: 60 },
    href: { type: String, trim: true, maxlength: 300 },
    meta: { type: mongoose.Schema.Types.Mixed },

    // Targeting
    targetRoles: [{ type: String, trim: true }], // e.g. ["SALES","ENGINEER"]
    targetUsers: [{ type: mongoose.Schema.ObjectId, ref: "User" }], // user-specific

    // Per-user read state (works for role-broadcast + direct targeting)
    readBy: [{ type: mongoose.Schema.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ targetRoles: 1, createdAt: -1 });
notificationSchema.index({ targetUsers: 1, createdAt: -1 });

export default mongoose.model("Notification", notificationSchema);

