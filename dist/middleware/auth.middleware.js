"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authorize = exports.verifyToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const User_model_1 = __importDefault(require("../models/User.model"));
// Verify JWT token
const error_middleware_1 = require("./error.middleware");
exports.verifyToken = (0, error_middleware_1.asyncHandler)(async (req, res, next) => {
    const token = req.header("Authorization")?.replace("Bearer ", "");
    if (!token) {
        return res.status(401).json({
            success: false,
            message: "Access denied. No token provided.",
        });
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET || "");
        const user = await User_model_1.default.findById(decoded.id).populate("role");
        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Invalid token.",
            });
        }
        req.user = user;
        next();
    }
    catch (error) {
        res.status(401).json({
            success: false,
            message: "Invalid token.",
        });
    }
});
// Check permissions: authorize(module, action)
const authorize = (module, action) => {
    return (0, error_middleware_1.asyncHandler)(async (req, res, next) => {
        const role = req.user?.role;
        const roleName = String(role?.name || "").toUpperCase();
        // Business rule: SALES should have ADMIN-like access for tickets.
        // Keep it scoped to ticket actions only (other modules still depend on RBAC matrix).
        if (module === "tickets" && roleName === "SALES")
            return next();
        if (!role.permissions[module]?.[action]) {
            return res.status(403).json({
                success: false,
                message: `Access denied: Insufficient permissions for ${module}:${action}`
            });
        }
        req.permissions = role.permissions[module];
        next();
    });
};
exports.authorize = authorize;
