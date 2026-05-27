"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const notificationSchema = new mongoose_1.default.Schema({
    title: { type: String, required: true, trim: true, maxlength: 140 },
    message: { type: String, trim: true, maxlength: 500 },
    kind: { type: String, trim: true, maxlength: 60 },
    href: { type: String, trim: true, maxlength: 300 },
    meta: { type: mongoose_1.default.Schema.Types.Mixed },
    // Targeting
    targetRoles: [{ type: String, trim: true }], // e.g. ["SALES","ENGINEER"]
    targetUsers: [{ type: mongoose_1.default.Schema.ObjectId, ref: "User" }], // user-specific
    // Per-user read state (works for role-broadcast + direct targeting)
    readBy: [{ type: mongoose_1.default.Schema.ObjectId, ref: "User" }],
}, { timestamps: true });
notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ targetRoles: 1, createdAt: -1 });
notificationSchema.index({ targetUsers: 1, createdAt: -1 });
exports.default = mongoose_1.default.model("Notification", notificationSchema);
