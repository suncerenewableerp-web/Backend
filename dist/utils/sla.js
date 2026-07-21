"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadSlaConfig = loadSlaConfig;
exports.targetHoursFor = targetHoursFor;
exports.slaTargetDate = slaTargetDate;
exports.computeSlaStatus = computeSlaStatus;
exports.closedAtOf = closedAtOf;
const SlaSettings_model_1 = __importDefault(require("../models/SlaSettings.model"));
const DEFAULTS = { criticalHours: 24, highHours: 48, normalHours: 72 };
// A ticket is flagged WARNING once it has used this much of its allowance,
// giving the team a chance to act before it actually breaches.
const WARNING_THRESHOLD = 0.8;
/** Reads the configured SLA hours, falling back to schema defaults. */
async function loadSlaConfig() {
    const doc = await SlaSettings_model_1.default.findById("default").lean();
    if (!doc)
        return { ...DEFAULTS };
    return {
        criticalHours: Number(doc.criticalHours) || DEFAULTS.criticalHours,
        highHours: Number(doc.highHours) || DEFAULTS.highHours,
        normalHours: Number(doc.normalHours) || DEFAULTS.normalHours,
    };
}
/**
 * Allowance for a priority. LOW and MEDIUM share the "normal" bucket, since
 * SLA settings only expose three tiers.
 */
function targetHoursFor(priority, config) {
    switch (String(priority || "").trim().toUpperCase()) {
        case "CRITICAL":
            return config.criticalHours;
        case "HIGH":
            return config.highHours;
        default:
            return config.normalHours;
    }
}
function slaTargetDate(createdAt, priority, config) {
    const start = new Date(createdAt).getTime();
    return new Date(start + targetHoursFor(priority, config) * 3600000);
}
/**
 * SLA status for a ticket.
 *
 * `closedAt` freezes the result: a ticket closed inside its window stays OK
 * forever instead of drifting to BREACHED as time passes.
 */
function computeSlaStatus(args) {
    const { createdAt, priority, config, closedAt, now = new Date() } = args;
    const start = new Date(createdAt).getTime();
    if (!Number.isFinite(start))
        return "OK";
    const allowanceMs = targetHoursFor(priority, config) * 3600000;
    const endMs = closedAt ? new Date(closedAt).getTime() : now.getTime();
    if (!Number.isFinite(endMs))
        return "OK";
    const elapsed = endMs - start;
    if (elapsed >= allowanceMs)
        return "BREACHED";
    if (elapsed >= allowanceMs * WARNING_THRESHOLD)
        return "WARNING";
    return "OK";
}
/** When a ticket reached CLOSED, or null if it is still open. */
function closedAtOf(ticket) {
    if (String(ticket?.status || "").toUpperCase() !== "CLOSED")
        return null;
    const history = Array.isArray(ticket?.statusHistory) ? ticket.statusHistory : [];
    const closedEntries = history
        .filter((h) => String(h?.status || "").toUpperCase() === "CLOSED")
        .map((h) => new Date(h?.changedAt || h?.createdAt || 0).getTime())
        .filter((t) => Number.isFinite(t) && t > 0);
    if (closedEntries.length)
        return new Date(Math.max(...closedEntries));
    // Legacy rows without a CLOSED history entry: fall back to last write.
    return ticket?.updatedAt ? new Date(ticket.updatedAt) : null;
}
