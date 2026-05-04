"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteJobCardRepairActionName = exports.updateJobCardRepairActionName = exports.addJobCardRepairActionName = exports.listJobCardRepairActionNames = exports.deleteJobCardEngineerName = exports.addJobCardEngineerName = exports.listJobCardEngineerNames = exports.deleteInverterCapacity = exports.addInverterCapacity = exports.listInverterCapacities = exports.addInverterModel = exports.listInverterModels = exports.deleteCustomerCompany = exports.addCustomerCompany = exports.listCustomerCompanies = exports.deleteInverterBrand = exports.addInverterBrand = exports.listInverterBrands = exports.updateSlaSettings = exports.getSlaSettings = void 0;
const SlaSettings_model_1 = __importDefault(require("../models/SlaSettings.model"));
const InverterBrand_model_1 = __importDefault(require("../models/InverterBrand.model"));
const CustomerCompany_model_1 = __importDefault(require("../models/CustomerCompany.model"));
const InverterCapacity_model_1 = __importDefault(require("../models/InverterCapacity.model"));
const InverterModel_model_1 = __importDefault(require("../models/InverterModel.model"));
const JobCardEngineerName_model_1 = __importDefault(require("../models/JobCardEngineerName.model"));
const JobCardRepairActionName_model_1 = __importDefault(require("../models/JobCardRepairActionName.model"));
const error_middleware_1 = require("../middleware/error.middleware");
const company_rep_seed_json_1 = __importDefault(require("../data/company_rep_seed.json"));
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
function normalizeCompanyName(input) {
    const raw = String(input || "").trim();
    if (!raw)
        return null;
    const name = raw.replace(/\s+/g, " ").trim();
    if (!name)
        return null;
    const key = name.toLowerCase();
    return { name, key };
}
function normalizeCapacityName(input) {
    const raw = String(input || "").trim();
    if (!raw)
        return null;
    const name = raw.replace(/\s+/g, " ").trim();
    if (!name)
        return null;
    const key = name.toLowerCase();
    return { name, key };
}
function normalizeModelName(input) {
    const raw = String(input || "").trim();
    if (!raw)
        return null;
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
function normalizeJobCardRepairActionName(input) {
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
// @desc    List customer companies (for dropdown)
// @route   GET /api/settings/customer-companies
exports.listCustomerCompanies = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const existingCount = await CustomerCompany_model_1.default.estimatedDocumentCount().catch(() => 0);
    if (!existingCount) {
        const seedRows = Array.isArray(company_rep_seed_json_1.default) ? company_rep_seed_json_1.default : [];
        const docs = seedRows
            .map((r) => {
            const name = String(r?.name || "").trim();
            const key = String(r?.key || "").trim();
            const repEmail = String(r?.repEmail || "").trim().toLowerCase();
            if (!name || !key)
                return null;
            return { name, key, ...(repEmail ? { repEmail } : {}) };
        })
            .filter(Boolean);
        try {
            await CustomerCompany_model_1.default.insertMany(docs, { ordered: false });
        }
        catch {
            // ignore
        }
    }
    const rows = await CustomerCompany_model_1.default.find({}).select("name").sort({ name: 1 }).lean();
    const companies = (rows || []).map((r) => String(r?.name || "").trim()).filter(Boolean);
    res.json({ success: true, data: companies });
});
// @desc    Add customer company to dropdown list (admin/sales)
// @route   POST /api/settings/customer-companies
exports.addCustomerCompany = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const roleName = String(req.user?.role?.name || "").toUpperCase();
    if (roleName !== "ADMIN" && roleName !== "SALES") {
        return res.status(403).json({ success: false, message: "Access denied." });
    }
    const parsed = normalizeCompanyName(req.body?.name);
    if (!parsed) {
        return res.status(400).json({ success: false, message: "Company name is required" });
    }
    if (parsed.name.length > 120) {
        return res.status(400).json({ success: false, message: "Company name too long" });
    }
    const doc = await CustomerCompany_model_1.default.findOneAndUpdate({ key: parsed.key }, { $setOnInsert: { name: parsed.name, key: parsed.key, createdBy: req.user?._id } }, { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }).lean();
    res.status(201).json({ success: true, data: { name: doc?.name || parsed.name } });
});
// @desc    Delete customer company from dropdown list (admin/sales)
// @route   DELETE /api/settings/customer-companies/:key
exports.deleteCustomerCompany = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const roleName = String(req.user?.role?.name || "").toUpperCase();
    if (roleName !== "ADMIN" && roleName !== "SALES") {
        return res.status(403).json({ success: false, message: "Access denied." });
    }
    const parsed = normalizeCompanyName(req.params?.key);
    if (!parsed) {
        return res.status(400).json({ success: false, message: "Company key is required" });
    }
    const deleted = await CustomerCompany_model_1.default.findOneAndDelete({ key: parsed.key }).lean();
    if (!deleted) {
        return res.status(404).json({ success: false, message: "Company not found" });
    }
    res.json({ success: true, data: { name: String(deleted?.name || "").trim() } });
});
// @desc    List inverter models for a make (for dropdown)
// @route   GET /api/settings/inverter-models?make=DELTA
exports.listInverterModels = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const parsedMake = normalizeBrandName(req.query?.make || req.query?.makeKey);
    if (!parsedMake) {
        return res.status(400).json({ success: false, message: "make is required" });
    }
    const rows = await InverterModel_model_1.default.find({ makeKey: parsedMake.key }).select("name").sort({ name: 1 }).lean();
    const models = (rows || []).map((r) => String(r?.name || "").trim()).filter(Boolean);
    res.json({ success: true, data: models });
});
// @desc    Add inverter model to dropdown list for a make (admin/sales)
// @route   POST /api/settings/inverter-models
exports.addInverterModel = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const roleName = String(req.user?.role?.name || "").toUpperCase();
    if (roleName !== "ADMIN" && roleName !== "SALES") {
        return res.status(403).json({ success: false, message: "Access denied." });
    }
    const parsedMake = normalizeBrandName(req.body?.make || req.body?.inverterMake);
    if (!parsedMake) {
        return res.status(400).json({ success: false, message: "make is required" });
    }
    if (parsedMake.name.length > 80) {
        return res.status(400).json({ success: false, message: "Make name too long" });
    }
    const parsedModel = normalizeModelName(req.body?.name || req.body?.model || req.body?.inverterModel);
    if (!parsedModel) {
        return res.status(400).json({ success: false, message: "Model name is required" });
    }
    if (parsedModel.name.length > 80) {
        return res.status(400).json({ success: false, message: "Model name too long" });
    }
    const doc = await InverterModel_model_1.default.findOneAndUpdate({ makeKey: parsedMake.key, key: parsedModel.key }, {
        $setOnInsert: {
            make: parsedMake.name,
            makeKey: parsedMake.key,
            name: parsedModel.name,
            key: parsedModel.key,
            createdBy: req.user?._id,
        },
    }, { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }).lean();
    res.status(201).json({ success: true, data: { name: doc?.name || parsedModel.name } });
});
// @desc    List inverter capacities (for dropdown)
// @route   GET /api/settings/inverter-capacities
exports.listInverterCapacities = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const rows = await InverterCapacity_model_1.default.find({}).select("name").sort({ name: 1 }).lean();
    const capacities = (rows || []).map((r) => String(r?.name || "").trim()).filter(Boolean);
    res.json({ success: true, data: capacities });
});
// @desc    Add inverter capacity to dropdown list (admin/sales)
// @route   POST /api/settings/inverter-capacities
exports.addInverterCapacity = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const roleName = String(req.user?.role?.name || "").toUpperCase();
    if (roleName !== "ADMIN" && roleName !== "SALES") {
        return res.status(403).json({ success: false, message: "Access denied." });
    }
    const parsed = normalizeCapacityName(req.body?.name);
    if (!parsed) {
        return res.status(400).json({ success: false, message: "Capacity is required" });
    }
    if (parsed.name.length > 40) {
        return res.status(400).json({ success: false, message: "Capacity too long" });
    }
    const doc = await InverterCapacity_model_1.default.findOneAndUpdate({ key: parsed.key }, { $setOnInsert: { name: parsed.name, key: parsed.key, createdBy: req.user?._id } }, { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }).lean();
    res.status(201).json({ success: true, data: { name: doc?.name || parsed.name } });
});
// @desc    Delete inverter capacity from dropdown list (admin)
// @route   DELETE /api/settings/inverter-capacities/:key
exports.deleteInverterCapacity = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const roleName = String(req.user?.role?.name || "").toUpperCase();
    if (roleName !== "ADMIN") {
        return res.status(403).json({ success: false, message: "Access denied." });
    }
    const parsed = normalizeCapacityName(req.params?.key);
    if (!parsed) {
        return res.status(400).json({ success: false, message: "Capacity key is required" });
    }
    const deleted = await InverterCapacity_model_1.default.findOneAndDelete({ key: parsed.key }).lean();
    if (!deleted) {
        return res.status(404).json({ success: false, message: "Capacity not found" });
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
// @desc    List jobcard card-repair action names (dropdown)
// @route   GET /api/settings/jobcard-repair-actions
exports.listJobCardRepairActionNames = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const rows = await JobCardRepairActionName_model_1.default.find({}).select("name").sort({ name: 1 }).lean();
    const names = (rows || []).map((r) => String(r?.name || "").trim()).filter(Boolean);
    res.json({ success: true, data: names });
});
// @desc    Add a jobcard card-repair action name (admin)
// @route   POST /api/settings/jobcard-repair-actions
exports.addJobCardRepairActionName = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const roleName = String(req.user?.role?.name || "").toUpperCase();
    if (roleName !== "ADMIN") {
        return res.status(403).json({ success: false, message: "Access denied." });
    }
    const parsed = normalizeJobCardRepairActionName(req.body?.name);
    if (!parsed) {
        return res.status(400).json({ success: false, message: "Name is required" });
    }
    if (parsed.name.length > 80) {
        return res.status(400).json({ success: false, message: "Name too long" });
    }
    const doc = await JobCardRepairActionName_model_1.default.findOneAndUpdate({ key: parsed.key }, { $setOnInsert: { name: parsed.name, key: parsed.key, createdBy: req.user?._id } }, { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }).lean();
    res.status(201).json({ success: true, data: { name: doc?.name || parsed.name } });
});
// @desc    Update a jobcard card-repair action name (admin)
// @route   PUT /api/settings/jobcard-repair-actions/:key
exports.updateJobCardRepairActionName = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const roleName = String(req.user?.role?.name || "").toUpperCase();
    if (roleName !== "ADMIN") {
        return res.status(403).json({ success: false, message: "Access denied." });
    }
    const oldParsed = normalizeJobCardRepairActionName(req.params?.key);
    if (!oldParsed) {
        return res.status(400).json({ success: false, message: "Name key is required" });
    }
    const nextParsed = normalizeJobCardRepairActionName(req.body?.name);
    if (!nextParsed) {
        return res.status(400).json({ success: false, message: "Name is required" });
    }
    if (nextParsed.name.length > 80) {
        return res.status(400).json({ success: false, message: "Name too long" });
    }
    const current = await JobCardRepairActionName_model_1.default.findOne({ key: oldParsed.key }).select("_id key").lean();
    if (!current?._id) {
        return res.status(404).json({ success: false, message: "Name not found" });
    }
    if (nextParsed.key !== oldParsed.key) {
        const collision = await JobCardRepairActionName_model_1.default.findOne({ key: nextParsed.key }).select("_id").lean();
        if (collision?._id) {
            return res.status(400).json({ success: false, message: "Name already exists" });
        }
    }
    const updated = await JobCardRepairActionName_model_1.default.findOneAndUpdate({ key: oldParsed.key }, { $set: { name: nextParsed.name, key: nextParsed.key } }, { new: true, runValidators: true }).lean();
    res.json({ success: true, data: { name: String(updated?.name || nextParsed.name || "").trim() } });
});
// @desc    Delete a jobcard card-repair action name (admin)
// @route   DELETE /api/settings/jobcard-repair-actions/:key
exports.deleteJobCardRepairActionName = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const roleName = String(req.user?.role?.name || "").toUpperCase();
    if (roleName !== "ADMIN") {
        return res.status(403).json({ success: false, message: "Access denied." });
    }
    const parsed = normalizeJobCardRepairActionName(req.params?.key);
    if (!parsed) {
        return res.status(400).json({ success: false, message: "Name key is required" });
    }
    const deleted = await JobCardRepairActionName_model_1.default.findOneAndDelete({ key: parsed.key }).lean();
    if (!deleted) {
        return res.status(404).json({ success: false, message: "Name not found" });
    }
    res.json({ success: true, data: { name: String(deleted?.name || "").trim() } });
});
