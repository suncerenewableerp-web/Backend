"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEngineers = exports.getUsers = void 0;
const User_model_1 = __importDefault(require("../models/User.model"));
const Role_model_1 = __importDefault(require("../models/Role.model"));
const error_middleware_1 = require("../middleware/error.middleware");
const helpers_1 = require("../utils/helpers");
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
