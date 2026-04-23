"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEngineerNames = exports.getEngineers = exports.updateUserRole = exports.resetUserPassword = exports.setUserPassword = exports.createUser = exports.getUsers = void 0;
const User_model_1 = __importDefault(require("../models/User.model"));
const Role_model_1 = __importDefault(require("../models/Role.model"));
const error_middleware_1 = require("../middleware/error.middleware");
const helpers_1 = require("../utils/helpers");
const emailAddress_1 = require("../utils/emailAddress");
const normalizeEmail = (email) => (0, emailAddress_1.normalizeEmailForStorage)(email);
const normalizeOptionalString = (v) => {
    if (v === undefined || v === null)
        return undefined;
    const s = String(v).trim();
    return s.length ? s : undefined;
};
// @desc    Get all users
// @route   GET /api/users
exports.getUsers = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const { page = 1, limit = 20 } = req.query;
    const { skip, limit: lim } = (0, helpers_1.getPagination)(page, limit);
    const users = await User_model_1.default.find({ isActive: true })
        .populate('role', 'name')
        .select('-password')
        .skip(skip)
        .limit(lim)
        .sort('-createdAt');
    const total = await User_model_1.default.countDocuments({ isActive: true });
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
exports.createUser = (0, error_middleware_1.asyncHandler)(async (req, res) => {
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
    if (!phoneNorm) {
        return res.status(400).json({
            success: false,
            message: "Phone is required",
            errors: { phone: { message: "Phone is required" } },
        });
    }
    const userExists = await User_model_1.default.findOne({ email: { $in: (0, emailAddress_1.emailLookupCandidates)(email) } }).collation({
        locale: "en",
        strength: 2,
    });
    if (userExists) {
        return res.status(400).json({ success: false, message: "User already exists" });
    }
    const roleDoc = await Role_model_1.default.findOne({ name: roleNorm });
    if (!roleDoc) {
        return res.status(400).json({ success: false, message: "Invalid role" });
    }
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
        user.save();
    }
    catch (err) {
        console.log(err);
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
exports.setUserPassword = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const userId = String(req.params.id || "").trim();
    const newPassword = String(req.body?.password || "");
    const oldPassword = String(req.body?.oldPassword || "");
    if (!userId) {
        return res.status(400).json({ success: false, message: "User id is required" });
    }
    if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ success: false, message: "New password must be at least 6 characters" });
    }
    const user = await User_model_1.default.findById(userId).select("+password").populate("role", "name");
    if (!user) {
        return res.status(404).json({ success: false, message: "User not found" });
    }
    const targetRoleName = String(user?.role?.name || "").toUpperCase();
    if (targetRoleName !== "CUSTOMER") {
        return res.status(403).json({
            success: false,
            message: "Old-password change is only allowed for CUSTOMER. Use admin reset for internal users.",
        });
    }
    if (!oldPassword) {
        return res.status(400).json({ success: false, message: "Old password is required" });
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
exports.resetUserPassword = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const userId = String(req.params.id || "").trim();
    const newPassword = String(req.body?.password || "");
    if (!userId) {
        return res.status(400).json({ success: false, message: "User id is required" });
    }
    if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ success: false, message: "Password must be at least 6 characters" });
    }
    const user = await User_model_1.default.findById(userId).select("+password").populate("role", "name");
    if (!user) {
        return res.status(404).json({ success: false, message: "User not found" });
    }
    user.password = newPassword;
    await user.save();
    res.json({ success: true, message: "Password reset" });
});
// @desc    Update a user's role (admin only)
// @route   PUT /api/users/:id/role
exports.updateUserRole = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const actorRole = String(req.user?.role?.name || "").trim().toUpperCase();
    if (actorRole !== "ADMIN") {
        return res.status(403).json({ success: false, message: "Access denied." });
    }
    const userId = String(req.params.id || "").trim();
    const roleNorm = String(req.body?.role || "").trim().toUpperCase();
    if (!userId) {
        return res.status(400).json({ success: false, message: "User id is required" });
    }
    if (!roleNorm) {
        return res.status(400).json({ success: false, message: "Role is required" });
    }
    const roleDoc = await Role_model_1.default.findOne({ name: roleNorm }).select("_id name").lean();
    if (!roleDoc?._id) {
        return res.status(400).json({ success: false, message: "Invalid role" });
    }
    const user = await User_model_1.default.findById(userId).populate("role", "name");
    if (!user) {
        return res.status(404).json({ success: false, message: "User not found" });
    }
    const currentRole = String(user?.role?.name || "").trim().toUpperCase();
    if (currentRole === "ADMIN" && roleNorm !== "ADMIN") {
        const adminRole = await Role_model_1.default.findOne({ name: "ADMIN" }).select("_id").lean();
        const adminCount = adminRole?._id
            ? await User_model_1.default.countDocuments({ role: adminRole._id, isActive: true })
            : 0;
        if (adminCount <= 1) {
            return res.status(400).json({
                success: false,
                message: "Cannot change role: at least one ADMIN is required.",
            });
        }
    }
    user.role = roleDoc._id;
    await user.save();
    await user.populate("role", "name");
    user.password = undefined;
    res.json({ success: true, data: { user } });
});
// @desc    Get engineers
// @route   GET /api/users/engineers
exports.getEngineers = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const engineerRole = await Role_model_1.default.findOne({ name: 'ENGINEER' }).select('_id');
    if (!engineerRole)
        return res.json({ success: true, data: [] });
    const engineers = await User_model_1.default.find({ role: engineerRole._id, isActive: true })
        .populate('role', 'name')
        .select('-password')
        .sort('name');
    res.json({ success: true, data: engineers });
});
// @desc    Get engineer names for dropdowns (internal use)
// @route   GET /api/users/engineer-names
exports.getEngineerNames = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const roleName = String(req.user?.role?.name || "").toUpperCase();
    if (!["ADMIN", "SALES", "ENGINEER"].includes(roleName)) {
        return res.status(403).json({ success: false, message: "Access denied" });
    }
    const engineerRole = await Role_model_1.default.findOne({ name: "ENGINEER" }).select("_id");
    if (!engineerRole)
        return res.json({ success: true, data: [] });
    const engineers = await User_model_1.default.find({ role: engineerRole._id, isActive: true })
        .select("name")
        .sort("name");
    res.json({
        success: true,
        data: engineers.map((u) => ({ id: String(u?._id || ""), name: String(u?.name || "") })),
    });
});
