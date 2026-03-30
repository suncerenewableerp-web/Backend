import jwt from "jsonwebtoken";
import User from "../models/User.model";
import Role from "../models/Role.model";
import { asyncHandler } from "../middleware/error.middleware";

const generateTokens = (userId: any) => {
  const accessToken = jwt.sign({ id: userId }, process.env.JWT_SECRET || "", { expiresIn: "15m" });
  const refreshToken = jwt.sign({ id: userId }, process.env.JWT_REFRESH_SECRET || "", { expiresIn: "7d" });
  return { accessToken, refreshToken };
};

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
const normalizeOptionalString = (v) => {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s.length ? s : undefined;
};

// @desc    Register user
// @route   POST /api/auth/signup
export const signup = asyncHandler(async (req: any, res: any) => {
  const { name, email, password, role, phone, company } = req.body;

  const emailNorm = normalizeEmail(email);
  const phoneNorm = normalizeOptionalString(phone);
  const companyNorm = normalizeOptionalString(company);
  const nameNorm = String(name || '').trim();
  const roleNorm = String(role || 'CUSTOMER').trim().toUpperCase();

  // Public signup is restricted to CUSTOMER accounts only.
  // Internal roles (ADMIN/SALES/ENGINEER/others) must be provisioned by an admin.
  if (roleNorm !== "CUSTOMER") {
    return res.status(403).json({
      success: false,
      message: "Only CUSTOMER signup is allowed. Please contact an administrator for access.",
    });
  }
  
  const userExists = await User.findOne({ email: emailNorm });
  if (userExists) return res.status(400).json({ success: false, message: 'User already exists' });

  const roleDoc = await Role.findOne({ name: roleNorm });
  if (!roleDoc) return res.status(400).json({ success: false, message: 'Invalid role' });

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
  await user.populate('role', 'name permissions');

  const { accessToken, refreshToken } = generateTokens(user._id);

  res.status(201).json({
    success: true,
    data: { user, accessToken, refreshToken, role: user.role }
  });
});

// @desc    Login user
// @route   POST /api/auth/login
export const login = asyncHandler(async (req: any, res: any) => {
  const { email, password } = req.body;
  const emailNorm = normalizeEmail(email);
  
  const user: any = await User.findOne({ email: emailNorm }).select('+password').populate('role');
  if (!user || !(await user.comparePassword(password))) {
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
  }

  const { accessToken, refreshToken } = generateTokens(user._id);

  res.json({
    success: true,
    data: { user, accessToken, refreshToken, role: user.role }
  });
});

// @desc    Refresh token
// @route   POST /api/auth/refresh
export const refresh = asyncHandler(async (req: any, res: any) => {
  const refreshToken = req.body.refreshToken;
  if (!refreshToken) return res.status(401).json({ success: false, message: 'No refresh token' });

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || "") as { id?: string };
    const user = await User.findById(decoded.id).populate("role");
    if (!user) return res.status(401).json({ success: false, message: 'Invalid refresh token' });
    
    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user._id);
    
    res.json({
      success: true,
      data: { accessToken, refreshToken: newRefreshToken }
    });
  } catch (error) {
    res.status(401).json({ success: false, message: 'Invalid refresh token' });
  }
});
