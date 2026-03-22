const User = require('../models/User.model');
const Role = require('../models/Role.model');
const jwt = require('jsonwebtoken');
const { asyncHandler } = require('../middleware/error.middleware');

const generateTokens = (userId) => {
  const accessToken = jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '15m' });
  const refreshToken = jwt.sign({ id: userId }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });
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
const signup = asyncHandler(async (req, res) => {
  const { name, email, password, role, phone, company } = req.body;

  const emailNorm = normalizeEmail(email);
  const phoneNorm = normalizeOptionalString(phone);
  const companyNorm = normalizeOptionalString(company);
  const nameNorm = String(name || '').trim();
  const roleNorm = String(role || '').trim().toUpperCase();
  
  const userExists = await User.findOne({ email: emailNorm });
  if (userExists) return res.status(400).json({ success: false, message: 'User already exists' });

  const roleDoc = await Role.findOne({ name: roleNorm });
  if (!roleDoc) return res.status(400).json({ success: false, message: 'Invalid role' });

  const user = await User.create({ name: nameNorm, email: emailNorm, password, role: roleDoc._id, phone: phoneNorm, company: companyNorm });
  await user.populate('role', 'name permissions');

  const { accessToken, refreshToken } = generateTokens(user._id);

  res.status(201).json({
    success: true,
    data: { user, accessToken, refreshToken, role: user.role }
  });
});

// @desc    Login user
// @route   POST /api/auth/login
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const emailNorm = normalizeEmail(email);
  
  const user = await User.findOne({ email: emailNorm }).select('+password').populate('role');
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
const refresh = asyncHandler(async (req, res) => {
  const refreshToken = req.body.refreshToken;
  if (!refreshToken) return res.status(401).json({ success: false, message: 'No refresh token' });

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await User.findById(decoded.id).populate('role');
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

module.exports = { signup, login, refresh };
