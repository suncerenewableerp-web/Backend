import SlaSettings from "../models/SlaSettings.model";
import InverterBrand from "../models/InverterBrand.model";
import CustomerCompany from "../models/CustomerCompany.model";
import InverterCapacity from "../models/InverterCapacity.model";
import JobCardEngineerName from "../models/JobCardEngineerName.model";
import JobCardRepairActionName from "../models/JobCardRepairActionName.model";
import { asyncHandler } from "../middleware/error.middleware";
import companyRepSeed from "../data/company_rep_seed.json";

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
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

function normalizeBrandName(input: any) {
  const raw = String(input || "").trim();
  if (!raw) return null;
  // Collapse whitespace and normalize.
  const name = raw.replace(/\s+/g, " ").trim();
  if (!name) return null;
  const key = name.toLowerCase();
  return { name, key };
}

function normalizeCompanyName(input: any) {
  const raw = String(input || "").trim();
  if (!raw) return null;
  const name = raw.replace(/\s+/g, " ").trim();
  if (!name) return null;
  const key = name.toLowerCase();
  return { name, key };
}

function normalizeCapacityName(input: any) {
  const raw = String(input || "").trim();
  if (!raw) return null;
  const name = raw.replace(/\s+/g, " ").trim();
  if (!name) return null;
  const key = name.toLowerCase();
  return { name, key };
}

function normalizeJobCardEngineerName(input: any) {
  const raw = String(input || "").trim();
  if (!raw) return null;
  const name = raw.replace(/\s+/g, " ").trim();
  if (!name) return null;
  const key = name.toLowerCase();
  return { name, key };
}

function normalizeJobCardRepairActionName(input: any) {
  const raw = String(input || "").trim();
  if (!raw) return null;
  const name = raw.replace(/\s+/g, " ").trim();
  if (!name) return null;
  const key = name.toLowerCase();
  return { name, key };
}

// @desc    Get SLA settings
// @route   GET /api/settings/sla
export const getSlaSettings = asyncHandler(async (req: any, res: any) => {
  let doc = await SlaSettings.findById('default');
  if (!doc) doc = await SlaSettings.create({ _id: 'default' });
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
export const updateSlaSettings = asyncHandler(async (req: any, res: any) => {
  const criticalHours = toPositiveInt(req.body?.criticalHours);
  const highHours = toPositiveInt(req.body?.highHours);
  const normalHours = toPositiveInt(req.body?.normalHours);

  const errors: Record<string, string> = {};
  if (criticalHours === null) errors.criticalHours = 'criticalHours must be a positive integer';
  if (highHours === null) errors.highHours = 'highHours must be a positive integer';
  if (normalHours === null) errors.normalHours = 'normalHours must be a positive integer';

  if (Object.keys(errors).length) {
    return res.status(400).json({ success: false, message: 'Invalid SLA settings', errors });
  }

  const doc = await SlaSettings.findByIdAndUpdate(
    'default',
    { $set: { criticalHours, highHours, normalHours } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );

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
export const listInverterBrands = asyncHandler(async (req: any, res: any) => {
  const existingCount = await InverterBrand.estimatedDocumentCount().catch(() => 0);
  if (!existingCount) {
    const docs = DEFAULT_INVERTER_BRANDS.map((name) => {
      const parsed = normalizeBrandName(name);
      return parsed ? { name: parsed.name, key: parsed.key } : null;
    }).filter(Boolean);
    try {
      // ordered:false => ignore duplicates if multiple servers seed concurrently
      await InverterBrand.insertMany(docs as any[], { ordered: false });
    } catch {
      // ignore
    }
  }

  const rows = await InverterBrand.find({}).select("name").sort({ name: 1 }).lean();
  const brands = (rows || []).map((r: any) => String(r?.name || "").trim()).filter(Boolean);
  res.json({ success: true, data: brands });
});

// @desc    Add inverter brand to dropdown list
// @route   POST /api/settings/inverter-brands
export const addInverterBrand = asyncHandler(async (req: any, res: any) => {
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

  const doc = await InverterBrand.findOneAndUpdate(
    { key: parsed.key },
    { $setOnInsert: { name: parsed.name, key: parsed.key, createdBy: req.user?._id } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  ).lean();

  res.status(201).json({ success: true, data: { name: doc?.name || parsed.name } });
});

// @desc    Delete inverter brand from dropdown list (admin)
// @route   DELETE /api/settings/inverter-brands/:key
export const deleteInverterBrand = asyncHandler(async (req: any, res: any) => {
  const roleName = String(req.user?.role?.name || "").toUpperCase();
  if (roleName !== "ADMIN") {
    return res.status(403).json({ success: false, message: "Access denied." });
  }

  const parsed = normalizeBrandName(req.params?.key);
  if (!parsed) {
    return res.status(400).json({ success: false, message: "Brand key is required" });
  }

  const deleted = await InverterBrand.findOneAndDelete({ key: parsed.key }).lean();
  if (!deleted) {
    return res.status(404).json({ success: false, message: "Brand not found" });
  }

  res.json({ success: true, data: { name: String(deleted?.name || "").trim() } });
});

// @desc    List customer companies (for dropdown)
// @route   GET /api/settings/customer-companies
export const listCustomerCompanies = asyncHandler(async (req: any, res: any) => {
  const existingCount = await CustomerCompany.estimatedDocumentCount().catch(() => 0);
  if (!existingCount) {
    const seedRows = Array.isArray(companyRepSeed) ? (companyRepSeed as any[]) : [];
    const docs = seedRows
      .map((r) => {
        const name = String(r?.name || "").trim();
        const key = String(r?.key || "").trim();
        const repEmail = String(r?.repEmail || "").trim().toLowerCase();
        if (!name || !key) return null;
        return { name, key, ...(repEmail ? { repEmail } : {}) };
      })
      .filter(Boolean);
    try {
      await CustomerCompany.insertMany(docs as any[], { ordered: false });
    } catch {
      // ignore
    }
  }

  const rows = await CustomerCompany.find({}).select("name").sort({ name: 1 }).lean();
  const companies = (rows || []).map((r: any) => String(r?.name || "").trim()).filter(Boolean);
  res.json({ success: true, data: companies });
});

// @desc    Add customer company to dropdown list (admin/sales)
// @route   POST /api/settings/customer-companies
export const addCustomerCompany = asyncHandler(async (req: any, res: any) => {
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

  const doc = await CustomerCompany.findOneAndUpdate(
    { key: parsed.key },
    { $setOnInsert: { name: parsed.name, key: parsed.key, createdBy: req.user?._id } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  ).lean();

  res.status(201).json({ success: true, data: { name: doc?.name || parsed.name } });
});

// @desc    Delete customer company from dropdown list (admin/sales)
// @route   DELETE /api/settings/customer-companies/:key
export const deleteCustomerCompany = asyncHandler(async (req: any, res: any) => {
  const roleName = String(req.user?.role?.name || "").toUpperCase();
  if (roleName !== "ADMIN" && roleName !== "SALES") {
    return res.status(403).json({ success: false, message: "Access denied." });
  }

  const parsed = normalizeCompanyName(req.params?.key);
  if (!parsed) {
    return res.status(400).json({ success: false, message: "Company key is required" });
  }

  const deleted = await CustomerCompany.findOneAndDelete({ key: parsed.key }).lean();
  if (!deleted) {
    return res.status(404).json({ success: false, message: "Company not found" });
  }

  res.json({ success: true, data: { name: String(deleted?.name || "").trim() } });
});

// @desc    List inverter capacities (for dropdown)
// @route   GET /api/settings/inverter-capacities
export const listInverterCapacities = asyncHandler(async (req: any, res: any) => {
  const rows = await InverterCapacity.find({}).select("name").sort({ name: 1 }).lean();
  const capacities = (rows || []).map((r: any) => String(r?.name || "").trim()).filter(Boolean);
  res.json({ success: true, data: capacities });
});

// @desc    Add inverter capacity to dropdown list (admin/sales)
// @route   POST /api/settings/inverter-capacities
export const addInverterCapacity = asyncHandler(async (req: any, res: any) => {
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

  const doc = await InverterCapacity.findOneAndUpdate(
    { key: parsed.key },
    { $setOnInsert: { name: parsed.name, key: parsed.key, createdBy: req.user?._id } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  ).lean();

  res.status(201).json({ success: true, data: { name: doc?.name || parsed.name } });
});

// @desc    Delete inverter capacity from dropdown list (admin)
// @route   DELETE /api/settings/inverter-capacities/:key
export const deleteInverterCapacity = asyncHandler(async (req: any, res: any) => {
  const roleName = String(req.user?.role?.name || "").toUpperCase();
  if (roleName !== "ADMIN") {
    return res.status(403).json({ success: false, message: "Access denied." });
  }

  const parsed = normalizeCapacityName(req.params?.key);
  if (!parsed) {
    return res.status(400).json({ success: false, message: "Capacity key is required" });
  }

  const deleted = await InverterCapacity.findOneAndDelete({ key: parsed.key }).lean();
  if (!deleted) {
    return res.status(404).json({ success: false, message: "Capacity not found" });
  }

  res.json({ success: true, data: { name: String(deleted?.name || "").trim() } });
});

// @desc    List jobcard engineer/sub-engineer names (dropdown)
// @route   GET /api/settings/jobcard-engineers
export const listJobCardEngineerNames = asyncHandler(async (req: any, res: any) => {
  const rows = await JobCardEngineerName.find({}).select("name").sort({ name: 1 }).lean();
  const names = (rows || []).map((r: any) => String(r?.name || "").trim()).filter(Boolean);
  res.json({ success: true, data: names });
});

// @desc    Add a jobcard engineer/sub-engineer name (admin)
// @route   POST /api/settings/jobcard-engineers
export const addJobCardEngineerName = asyncHandler(async (req: any, res: any) => {
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

  const doc = await JobCardEngineerName.findOneAndUpdate(
    { key: parsed.key },
    { $setOnInsert: { name: parsed.name, key: parsed.key, createdBy: req.user?._id } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  ).lean();

  res.status(201).json({ success: true, data: { name: doc?.name || parsed.name } });
});

// @desc    Delete a jobcard engineer/sub-engineer name (admin)
// @route   DELETE /api/settings/jobcard-engineers/:key
export const deleteJobCardEngineerName = asyncHandler(async (req: any, res: any) => {
  const roleName = String(req.user?.role?.name || "").toUpperCase();
  if (roleName !== "ADMIN") {
    return res.status(403).json({ success: false, message: "Access denied." });
  }

  const parsed = normalizeJobCardEngineerName(req.params?.key);
  if (!parsed) {
    return res.status(400).json({ success: false, message: "Name key is required" });
  }

  const deleted = await JobCardEngineerName.findOneAndDelete({ key: parsed.key }).lean();
  if (!deleted) {
    return res.status(404).json({ success: false, message: "Name not found" });
  }

  res.json({ success: true, data: { name: String(deleted?.name || "").trim() } });
});

// @desc    List jobcard card-repair action names (dropdown)
// @route   GET /api/settings/jobcard-repair-actions
export const listJobCardRepairActionNames = asyncHandler(async (req: any, res: any) => {
  const rows = await JobCardRepairActionName.find({}).select("name").sort({ name: 1 }).lean();
  const names = (rows || []).map((r: any) => String(r?.name || "").trim()).filter(Boolean);
  res.json({ success: true, data: names });
});

// @desc    Add a jobcard card-repair action name (admin)
// @route   POST /api/settings/jobcard-repair-actions
export const addJobCardRepairActionName = asyncHandler(async (req: any, res: any) => {
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

  const doc = await JobCardRepairActionName.findOneAndUpdate(
    { key: parsed.key },
    { $setOnInsert: { name: parsed.name, key: parsed.key, createdBy: req.user?._id } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  ).lean();

  res.status(201).json({ success: true, data: { name: doc?.name || parsed.name } });
});

// @desc    Update a jobcard card-repair action name (admin)
// @route   PUT /api/settings/jobcard-repair-actions/:key
export const updateJobCardRepairActionName = asyncHandler(async (req: any, res: any) => {
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

  const current = await JobCardRepairActionName.findOne({ key: oldParsed.key }).select("_id key").lean();
  if (!current?._id) {
    return res.status(404).json({ success: false, message: "Name not found" });
  }

  if (nextParsed.key !== oldParsed.key) {
    const collision = await JobCardRepairActionName.findOne({ key: nextParsed.key }).select("_id").lean();
    if (collision?._id) {
      return res.status(400).json({ success: false, message: "Name already exists" });
    }
  }

  const updated = await JobCardRepairActionName.findOneAndUpdate(
    { key: oldParsed.key },
    { $set: { name: nextParsed.name, key: nextParsed.key } },
    { new: true, runValidators: true },
  ).lean();

  res.json({ success: true, data: { name: String(updated?.name || nextParsed.name || "").trim() } });
});

// @desc    Delete a jobcard card-repair action name (admin)
// @route   DELETE /api/settings/jobcard-repair-actions/:key
export const deleteJobCardRepairActionName = asyncHandler(async (req: any, res: any) => {
  const roleName = String(req.user?.role?.name || "").toUpperCase();
  if (roleName !== "ADMIN") {
    return res.status(403).json({ success: false, message: "Access denied." });
  }

  const parsed = normalizeJobCardRepairActionName(req.params?.key);
  if (!parsed) {
    return res.status(400).json({ success: false, message: "Name key is required" });
  }

  const deleted = await JobCardRepairActionName.findOneAndDelete({ key: parsed.key }).lean();
  if (!deleted) {
    return res.status(404).json({ success: false, message: "Name not found" });
  }

  res.json({ success: true, data: { name: String(deleted?.name || "").trim() } });
});
