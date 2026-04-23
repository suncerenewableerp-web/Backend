"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteJobCardEngineerName = exports.addJobCardEngineerName = exports.listJobCardEngineerNames = exports.deleteInverterBrand = exports.addInverterBrand = exports.listInverterBrands = exports.updateSlaSettings = exports.getSlaSettings = void 0;
const SlaSettings_model_1 = __importDefault(require("../models/SlaSettings.model"));
const InverterBrand_model_1 = __importDefault(require("../models/InverterBrand.model"));
const JobCardEngineerName_model_1 = __importDefault(require("../models/JobCardEngineerName.model"));
const error_middleware_1 = require("../middleware/error.middleware");
const DEFAULT_INVERTER_BRANDS = [
    "ABB",
    "ADVANCED ENERGY",
    "Astronergy",
    "CHINT",
    "DELTA",
    "EAPRO",
    "EUROLEX",
    "FRONIUS",
    "GOODWE",
    "GROWATT",
    "HAVELLS",
    "HUAWEI",
    "INGETEAM",
    "JAKSON",
    "JFY-TECH",
    "K SOLARE",
    "KACO",
    "KSATAR",
    "KSOLARE",
    "LUMINOUS",
    "microlyte",
    "MUSCLE",
    "OFFGRID",
    "Oorja on Move(ZTT)",
    "POWER ONE",
    "REFUsol",
    "REPLUS",
    "SAJ",
    "SCHNEIDER ELECTRIC",
    "SMA",
    "SOFAR",
    "SOLA X POWER",
    "SOLAR EDGE",
    "SOLEPLANET",
    "SOLEX",
    "SOLIS",
    "Statcon",
    "SUCAM",
    "SUNGROW",
    "TBEA",
    "THEA",
    "VIKRAM SOLAR",
    "WAAREE",
    "Zeversolar",
];
function toPositiveInt(v) {
    const n = typeof v === 'number' ? v : Number.parseInt(String(v || ''), 10);
    if (!Number.isFinite(n) || n <= 0)
        return null;
    return Math.trunc(n);
}
function normalizeBrandName(input) {
    const raw = String(input || "").trim();
    if (!raw)
        return null;
    // Collapse whitespace and normalize.
    const name = raw.replace(/\s+/g, " ").trim();
    if (!name)
        return null;
    const key = name.toLowerCase();
    return { name, key };
}
function normalizeJobCardEngineerName(input) {
    const raw = String(input || "").trim();
    if (!raw)
        return null;
    const name = raw.replace(/\s+/g, " ").trim();
    if (!name)
        return null;
    const key = name.toLowerCase();
    return { name, key };
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
// @desc    List inverter brands (for dropdown)
// @route   GET /api/settings/inverter-brands
exports.listInverterBrands = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const existingCount = await InverterBrand_model_1.default.estimatedDocumentCount().catch(() => 0);
    if (!existingCount) {
        const docs = DEFAULT_INVERTER_BRANDS.map((name) => {
            const parsed = normalizeBrandName(name);
            return parsed ? { name: parsed.name, key: parsed.key } : null;
        }).filter(Boolean);
        try {
            // ordered:false => ignore duplicates if multiple servers seed concurrently
            await InverterBrand_model_1.default.insertMany(docs, { ordered: false });
        }
        catch {
            // ignore
        }
    }
    const rows = await InverterBrand_model_1.default.find({}).select("name").sort({ name: 1 }).lean();
    const brands = (rows || []).map((r) => String(r?.name || "").trim()).filter(Boolean);
    res.json({ success: true, data: brands });
});
// @desc    Add inverter brand to dropdown list
// @route   POST /api/settings/inverter-brands
exports.addInverterBrand = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const roleName = String(req.user?.role?.name || "").toUpperCase();
    if (roleName !== "ADMIN") {
        return res.status(403).json({ success: false, message: "Access denied." });
    }
    const parsed = normalizeBrandName(req.body?.name);
    if (!parsed) {
        return res.status(400).json({ success: false, message: "Brand name is required" });
    }
    if (parsed.name.length > 80) {
        return res.status(400).json({ success: false, message: "Brand name too long" });
    }
    const doc = await InverterBrand_model_1.default.findOneAndUpdate({ key: parsed.key }, { $setOnInsert: { name: parsed.name, key: parsed.key, createdBy: req.user?._id } }, { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }).lean();
    res.status(201).json({ success: true, data: { name: doc?.name || parsed.name } });
});
// @desc    Delete inverter brand from dropdown list (admin)
// @route   DELETE /api/settings/inverter-brands/:key
exports.deleteInverterBrand = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const roleName = String(req.user?.role?.name || "").toUpperCase();
    if (roleName !== "ADMIN") {
        return res.status(403).json({ success: false, message: "Access denied." });
    }
    const parsed = normalizeBrandName(req.params?.key);
    if (!parsed) {
        return res.status(400).json({ success: false, message: "Brand key is required" });
    }
    const deleted = await InverterBrand_model_1.default.findOneAndDelete({ key: parsed.key }).lean();
    if (!deleted) {
        return res.status(404).json({ success: false, message: "Brand not found" });
    }
    res.json({ success: true, data: { name: String(deleted?.name || "").trim() } });
});
// @desc    List jobcard engineer/sub-engineer names (dropdown)
// @route   GET /api/settings/jobcard-engineers
exports.listJobCardEngineerNames = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const rows = await JobCardEngineerName_model_1.default.find({}).select("name").sort({ name: 1 }).lean();
    const names = (rows || []).map((r) => String(r?.name || "").trim()).filter(Boolean);
    res.json({ success: true, data: names });
});
// @desc    Add a jobcard engineer/sub-engineer name (admin)
// @route   POST /api/settings/jobcard-engineers
exports.addJobCardEngineerName = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const roleName = String(req.user?.role?.name || "").toUpperCase();
    if (roleName !== "ADMIN") {
        return res.status(403).json({ success: false, message: "Access denied." });
    }
    const parsed = normalizeJobCardEngineerName(req.body?.name);
    if (!parsed) {
        return res.status(400).json({ success: false, message: "Name is required" });
    }
    if (parsed.name.length > 80) {
        return res.status(400).json({ success: false, message: "Name too long" });
    }
    const doc = await JobCardEngineerName_model_1.default.findOneAndUpdate({ key: parsed.key }, { $setOnInsert: { name: parsed.name, key: parsed.key, createdBy: req.user?._id } }, { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }).lean();
    res.status(201).json({ success: true, data: { name: doc?.name || parsed.name } });
});
// @desc    Delete a jobcard engineer/sub-engineer name (admin)
// @route   DELETE /api/settings/jobcard-engineers/:key
exports.deleteJobCardEngineerName = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const roleName = String(req.user?.role?.name || "").toUpperCase();
    if (roleName !== "ADMIN") {
        return res.status(403).json({ success: false, message: "Access denied." });
    }
    const parsed = normalizeJobCardEngineerName(req.params?.key);
    if (!parsed) {
        return res.status(400).json({ success: false, message: "Name key is required" });
    }
    const deleted = await JobCardEngineerName_model_1.default.findOneAndDelete({ key: parsed.key }).lean();
    if (!deleted) {
        return res.status(404).json({ success: false, message: "Name not found" });
    }
    res.json({ success: true, data: { name: String(deleted?.name || "").trim() } });
});
