"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateSlaSettings = exports.getSlaSettings = void 0;
const SlaSettings_model_1 = __importDefault(require("../models/SlaSettings.model"));
const error_middleware_1 = require("../middleware/error.middleware");
function toPositiveInt(v) {
    const n = typeof v === 'number' ? v : Number.parseInt(String(v || ''), 10);
    if (!Number.isFinite(n) || n <= 0)
        return null;
    return Math.trunc(n);
}
// @desc    Get SLA settings
// @route   GET /api/settings/sla
exports.getSlaSettings = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    let doc = await SlaSettings_model_1.default.findById('default');
    if (!doc)
        doc = await SlaSettings_model_1.default.create({ _id: 'default' });
    res.json({
        success: true,
        data: {
            criticalHours: doc.criticalHours,
            highHours: doc.highHours,
            normalHours: doc.normalHours,
        },
    });
});
// @desc    Update SLA settings (admin)
// @route   PUT /api/settings/sla
exports.updateSlaSettings = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const criticalHours = toPositiveInt(req.body?.criticalHours);
    const highHours = toPositiveInt(req.body?.highHours);
    const normalHours = toPositiveInt(req.body?.normalHours);
    const errors = {};
    if (criticalHours === null)
        errors.criticalHours = 'criticalHours must be a positive integer';
    if (highHours === null)
        errors.highHours = 'highHours must be a positive integer';
    if (normalHours === null)
        errors.normalHours = 'normalHours must be a positive integer';
    if (Object.keys(errors).length) {
        return res.status(400).json({ success: false, message: 'Invalid SLA settings', errors });
    }
    const doc = await SlaSettings_model_1.default.findByIdAndUpdate('default', { $set: { criticalHours, highHours, normalHours } }, { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true });
    res.json({
        success: true,
        data: {
            criticalHours: doc.criticalHours,
            highHours: doc.highHours,
            normalHours: doc.normalHours,
        },
    });
});
