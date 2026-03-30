import jwt from "jsonwebtoken";
import User from "../models/User.model";
import Role from "../models/Role.model";
import { asyncHandler } from "../middleware/error.middleware";
import crypto from "crypto";
import { sendEmail } from "../utils/email";
import { emailLookupCandidates, normalizeEmailForStorage } from "../utils/emailAddress";

const generateTokens = (userId: any) => {
  const accessToken = jwt.sign({ id: userId }, process.env.JWT_SECRET || "", { expiresIn: "15m" });
  const refreshToken = jwt.sign({ id: userId }, process.env.JWT_REFRESH_SECRET || "", { expiresIn: "7d" });
  return { accessToken, refreshToken };
};

const normalizeEmail = (email) => normalizeEmailForStorage(email);
const normalizeOptionalString = (v) => {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s.length ? s : undefined;
};

const EMAIL_COLLATION = { locale: "en", strength: 2 } as const;

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
  
  const userExists = await User.findOne({ email: { $in: emailLookupCandidates(email) } }).collation(EMAIL_COLLATION);
  if (userExists) return res.status(400).json({ success: false, message: 'User already exists' });

  const roleDoc = await Role.findOne({ name: roleNorm });
  if (!roleDoc) return res.status(400).json({ success: false, message: 'Invalid role' });

  let user: any;
  try {
    user = new User({
      name: nameNorm,
      email: emailNorm,
      password,
      role: roleDoc._id,
      phone: phoneNorm,
      company: companyNorm,
    });
    await user.save();
  } catch (err: any) {
    console.log(err)
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
  
  const user: any = await User.findOne({ email: { $in: emailLookupCandidates(email) }, isActive: true })
    .collation(EMAIL_COLLATION)
    .select('+password')
    .populate('role');
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

const normalizeBaseUrl = (raw: unknown) => {
  const s = String(raw || "").trim();
  if (!s) return "";
  return s.endsWith("/") ? s.slice(0, -1) : s;
};

// @desc    Request password reset email (CUSTOMER only)
// @route   POST /api/auth/forgot-password
export const forgotPassword = asyncHandler(async (req: any, res: any) => {
  const emailNorm = normalizeEmail(req.body?.email);
  const isDev = process.env.NODE_ENV !== "production";
  const returnDebugLink = isDev && String(process.env.FORGOT_PASSWORD_RETURN_LINK || "").toLowerCase() === "true";

  // Always return success to avoid email enumeration.
  const okResponse = (debugResetLink?: string) =>
    res.json({
      success: true,
      message: "If an account exists for this email, a reset link has been sent.",
      ...(returnDebugLink && debugResetLink ? { debugResetLink } : {}),
    });

  if (!emailNorm || !emailNorm.includes("@")) return okResponse();

  const user: any = await User.findOne({ email: { $in: emailLookupCandidates(req.body?.email) }, isActive: true })
    .collation(EMAIL_COLLATION)
    .select("+password resetPasswordToken resetPasswordExpire")
    .populate("role", "name");

  if (!user) return okResponse();
  const roleName = String(user?.role?.name || "").toUpperCase();
  if (roleName !== "CUSTOMER") return okResponse();

  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  user.resetPasswordToken = tokenHash;
  user.resetPasswordExpire = new Date(Date.now() + 15 * 60 * 1000);
  await user.save();

  const base = normalizeBaseUrl(process.env.FRONTEND_URL || "http://localhost:3000");
  const link = `${base}/reset-password?token=${encodeURIComponent(token)}`;

  const subject = "Reset your Sunce ERP password";
  const text =
    `We received a request to reset your password.\n\n` +
    `Reset link (valid for 15 minutes):\n${link}\n\n` +
    `If you did not request this, you can ignore this email.`;

  try {
    const result = await sendEmail({ to: emailNorm, subject, text });
    if (!result.sent && isDev) {
      console.warn("🔗 Password reset link (dev):", link);
    }
  } catch (e) {
    console.error("📧 Failed to send reset email:", e);
    if (isDev) console.warn("🔗 Password reset link (dev):", link);
  }

  return okResponse(link);
});

// @desc    Reset password using token (CUSTOMER only)
// @route   POST /api/auth/reset-password
export const resetPassword = asyncHandler(async (req: any, res: any) => {
  const token = String(req.body?.token || "").trim();
  const password = String(req.body?.password || "");
  if (!token) return res.status(400).json({ success: false, message: "Reset token is required" });
  if (!password || password.length < 6) {
    return res.status(400).json({ success: false, message: "Password must be at least 6 characters" });
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const user: any = await User.findOne({
    resetPasswordToken: tokenHash,
    resetPasswordExpire: { $gt: new Date() },
    isActive: true,
  })
    .select("+password resetPasswordToken resetPasswordExpire")
    .populate("role", "name");

  if (!user) {
    return res.status(400).json({ success: false, message: "Reset link is invalid or expired" });
  }

  const roleName = String(user?.role?.name || "").toUpperCase();
  if (roleName !== "CUSTOMER") {
    return res.status(403).json({ success: false, message: "Reset is only allowed for CUSTOMER accounts" });
  }

  user.password = password;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  await user.save();

  res.json({ success: true, message: "Password reset successfully" });
});
