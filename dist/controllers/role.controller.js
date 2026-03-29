"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteRole = exports.updateRole = exports.createRole = exports.getRoleMatrix = exports.getRoles = void 0;
const Role_model_1 = __importDefault(require("../models/Role.model"));
const error_middleware_1 = require("../middleware/error.middleware");
const isSystemRoleName = (name) => ['ADMIN', 'SALES', 'ENGINEER', 'CUSTOMER'].includes(String(name).toUpperCase());
// @desc    Get all roles
// @route   GET /api/roles
exports.getRoles = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const roles = await Role_model_1.default.find({}).sort('name');
    res.json({ success: true, data: roles });
});
// @desc    Get permission matrix
// @route   GET /api/roles/matrix
exports.getRoleMatrix = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const roles = await Role_model_1.default.find({}).select('name permissions').lean();
    const modules = Object.keys(roles[0]?.permissions || {});
    const matrix = roles.map(role => ({
        name: role.name,
        ...role.permissions
    }));
    res.json({
        success: true,
        data: {
            matrix,
            modules
        }
    });
});
// @desc    Create role
// @route   POST /api/roles
exports.createRole = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const { name, label, color, description, permissions } = req.body;
    if (!name)
        return res.status(400).json({ success: false, message: 'Role name is required' });
    const roleName = String(name).toUpperCase();
    const exists = await Role_model_1.default.findOne({ name: roleName });
    if (exists)
        return res.status(400).json({ success: false, message: 'Role already exists' });
    const role = await Role_model_1.default.create({
        name: roleName,
        label,
        color,
        description,
        permissions,
        isSystem: isSystemRoleName(roleName)
    });
    res.status(201).json({ success: true, data: role });
});
// @desc    Update role
// @route   PUT /api/roles/:id
exports.updateRole = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const role = await Role_model_1.default.findById(req.params.id);
    if (!role)
        return res.status(404).json({ success: false, message: 'Role not found' });
    if (role.isSystem && req.body?.name && String(req.body.name).toUpperCase() !== role.name) {
        return res.status(400).json({ success: false, message: 'System role name cannot be changed' });
    }
    if (req.body?.name)
        role.name = String(req.body.name).toUpperCase();
    if (req.body?.label !== undefined)
        role.label = req.body.label;
    if (req.body?.color !== undefined)
        role.color = req.body.color;
    if (req.body?.description !== undefined)
        role.description = req.body.description;
    if (req.body?.permissions)
        role.permissions = req.body.permissions;
    role.isSystem = isSystemRoleName(role.name);
    await role.save();
    res.json({ success: true, data: role });
});
// @desc    Delete role
// @route   DELETE /api/roles/:id
exports.deleteRole = (0, error_middleware_1.asyncHandler)(async (req, res) => {
    const role = await Role_model_1.default.findById(req.params.id);
    if (!role)
        return res.status(404).json({ success: false, message: 'Role not found' });
    if (role.isSystem) {
        return res.status(400).json({ success: false, message: 'System roles cannot be deleted' });
    }
    await role.deleteOne();
    res.json({ success: true, message: 'Role deleted' });
});
