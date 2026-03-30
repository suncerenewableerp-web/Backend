import User from "../models/User.model";
import Role from "../models/Role.model";
import { asyncHandler } from "../middleware/error.middleware";
import { getPagination } from "../utils/helpers";

const normalizeEmail = (email: unknown) =>
  String(email || "").trim().toLowerCase();
const normalizeOptionalString = (v: unknown) => {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s.length ? s : undefined;
};

// @desc    Get all users
// @route   GET /api/users
export const getUsers = asyncHandler(async (req: any, res: any) => {
  const { page = 1, limit = 20 } = req.query;
  const { skip, limit: lim } = getPagination(page, limit);
  
  const users = await User.find({ isActive: true })
    .populate('role', 'name')
    .select('-password')
    .skip(skip)
    .limit(lim)
    .sort('-createdAt');
    
  const total = await User.countDocuments({ isActive: true });
  
  res.json({
    success: true,
    data: {
      users,
      pagination: { total, page: parseInt(page), limit: lim, pages: Math.ceil(total / lim) }
    }
  });
});

// @desc    Create a user (admin-provisioned)
// @route   POST /api/users
export const createUser = asyncHandler(async (req: any, res: any) => {
  const { name, email, password, role, phone, company } = req.body;

  const nameNorm = String(name || "").trim();
  const emailNorm = normalizeEmail(email);
  const phoneNorm = normalizeOptionalString(phone);
  const companyNorm = normalizeOptionalString(company);
  const roleNorm = String(role || "").trim().toUpperCase();

  if (!nameNorm) {
    return res.status(400).json({ success: false, message: "Name is required" });
  }
  if (!emailNorm || !emailNorm.includes("@")) {
    return res.status(400).json({ success: false, message: "Valid email is required" });
  }
  if (!password || String(password).length < 6) {
    return res.status(400).json({ success: false, message: "Password must be at least 6 characters" });
  }
  if (!roleNorm) {
    return res.status(400).json({ success: false, message: "Role is required" });
  }

  const userExists = await User.findOne({ email: emailNorm });
  if (userExists) {
    return res.status(400).json({ success: false, message: "User already exists" });
  }

  const roleDoc = await Role.findOne({ name: roleNorm });
  if (!roleDoc) {
    return res.status(400).json({ success: false, message: "Invalid role" });
  }

  let user: any;
  try {
    user = await User.create({
      name: nameNorm,
      email: emailNorm,
      password,
      role: roleDoc._id,
      phone: phoneNorm,
      company: companyNorm,
    });
  } catch (err: any) {
    if (err?.code === 11000) {
      return res.status(400).json({ success: false, message: "User already exists" });
    }
    throw err;
  }

  await user.populate("role", "name");
  user.password = undefined;

  res.status(201).json({ success: true, data: { user } });
});

// @desc    Set/reset a user's password (admin-provisioned)
// @route   PUT /api/users/:id/password
export const setUserPassword = asyncHandler(async (req: any, res: any) => {
  const userId = String(req.params.id || "").trim();
  const newPassword = String(req.body?.password || "");
  const oldPassword = String(req.body?.oldPassword || "");

  if (!userId) {
    return res.status(400).json({ success: false, message: "User id is required" });
  }
  if (!oldPassword) {
    return res.status(400).json({ success: false, message: "Old password is required" });
  }
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ success: false, message: "New password must be at least 6 characters" });
  }

  const user: any = await User.findById(userId).select("+password").populate("role", "name");
  if (!user) {
    return res.status(404).json({ success: false, message: "User not found" });
  }

  const ok = await user.comparePassword(oldPassword);
  if (!ok) {
    return res.status(401).json({ success: false, message: "Old password is incorrect" });
  }

  user.password = newPassword;
  await user.save();

  res.json({ success: true, message: "Password updated" });
});

// @desc    Reset a user's password (admin)
// @route   POST /api/users/:id/password/reset
export const resetUserPassword = asyncHandler(async (req: any, res: any) => {
  const userId = String(req.params.id || "").trim();
  const newPassword = String(req.body?.password || "");

  if (!userId) {
    return res.status(400).json({ success: false, message: "User id is required" });
  }
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ success: false, message: "Password must be at least 6 characters" });
  }

  const user: any = await User.findById(userId).select("+password").populate("role", "name");
  if (!user) {
    return res.status(404).json({ success: false, message: "User not found" });
  }

  user.password = newPassword;
  await user.save();

  res.json({ success: true, message: "Password reset" });
});

// @desc    Get engineers
// @route   GET /api/users/engineers
export const getEngineers = asyncHandler(async (req: any, res: any) => {
  const engineerRole = await Role.findOne({ name: 'ENGINEER' }).select('_id');
  if (!engineerRole) return res.json({ success: true, data: [] });

  const engineers = await User.find({ role: engineerRole._id, isActive: true })
    .populate('role', 'name')
    .select('-password')
    .sort('name');
    
  res.json({ success: true, data: engineers });
});
