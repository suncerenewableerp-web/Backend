import SlaSettings from "../models/SlaSettings.model";
import InverterBrand from "../models/InverterBrand.model";
import { asyncHandler } from "../middleware/error.middleware";

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
