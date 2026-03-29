"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.refresh = exports.login = exports.signup = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const User_model_1 = __importDefault(require("../models/User.model"));
const Role_model_1 = __importDefault(require("../models/Role.model"));
const error_middleware_1 = require("../middleware/error.middleware");
const generateTokens = (userId) => {
    const accessToken = jsonwebtoken_1.default.sign({ id: userId }, process.env.JWT_SECRET || "", { expiresIn: "15m" });
    const refreshToken = jsonwebtoken_1.default.sign({ id: userId }, process.env.JWT_REFRESH_SECRET || "", { expiresIn: "7d" });
    return { accessToken, refreshToken };
};
const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
const normalizeOptionalString = (v) => {
    if (v === undefined || v === null)
        return undefined;
    const s = String(v).trim();
    return s.length ? s : undefined;
};
// @desc    Register user
// @route   POST /api/auth/signup
exports.signup = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const { name, email, password, role, phone, company } = req.body;
    const emailNorm = normalizeEmail(email);
    const phoneNorm = normalizeOptionalString(phone);
    const companyNorm = normalizeOptionalString(company);
    const nameNorm = String(name || '').trim();
    const roleNorm = String(role || '').trim().toUpperCase();
    const userExists = await User_model_1.default.findOne({ email: emailNorm });
    if (userExists)
        return res.status(400).json({ success: false, message: 'User already exists' });
    const roleDoc = await Role_model_1.default.findOne({ name: roleNorm });
    if (!roleDoc)
        return res.status(400).json({ success: false, message: 'Invalid role' });
    let user;
    try {
        user = await User_model_1.default.create({
            name: nameNorm,
            email: emailNorm,
            password,
            role: roleDoc._id,
            phone: phoneNorm,
            company: companyNorm,
        });
    }
    catch (err) {
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
exports.login = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const { email, password } = req.body;
    const emailNorm = normalizeEmail(email);
    const user = await User_model_1.default.findOne({ email: emailNorm }).select('+password').populate('role');
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
exports.refresh = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const refreshToken = req.body.refreshToken;
    if (!refreshToken)
        return res.status(401).json({ success: false, message: 'No refresh token' });
    try {
        const decoded = jsonwebtoken_1.default.verify(refreshToken, process.env.JWT_REFRESH_SECRET || "");
        const user = await User_model_1.default.findById(decoded.id).populate("role");
        if (!user)
            return res.status(401).json({ success: false, message: 'Invalid refresh token' });
        const { accessToken, refreshToken: newRefreshToken } = generateTokens(user._id);
        res.json({
            success: true,
            data: { accessToken, refreshToken: newRefreshToken }
        });
    }
    catch (error) {
        res.status(401).json({ success: false, message: 'Invalid refresh token' });
    }
});
