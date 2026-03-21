const Role = require('../models/Role.model');
const { asyncHandler } = require('../middleware/error.middleware');

const isSystemRoleName = (name) => ['ADMIN', 'SALES', 'ENGINEER', 'CUSTOMER'].includes(String(name).toUpperCase());

// @desc    Get all roles
// @route   GET /api/roles
const getRoles = asyncHandler(async (req, res) => {
  const roles = await Role.find({}).sort('name');
  res.json({ success: true, data: roles });
});

// @desc    Get permission matrix
// @route   GET /api/roles/matrix
const getRoleMatrix = asyncHandler(async (req, res) => {
  const roles = await Role.find({}).select('name permissions').lean();
  
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
const createRole = asyncHandler(async (req, res) => {
  const { name, description, permissions } = req.body;
  if (!name) return res.status(400).json({ success: false, message: 'Role name is required' });

  const roleName = String(name).toUpperCase();
  const exists = await Role.findOne({ name: roleName });
  if (exists) return res.status(400).json({ success: false, message: 'Role already exists' });

  const role = await Role.create({
    name: roleName,
    description,
    permissions,
    isSystem: isSystemRoleName(roleName)
  });

  res.status(201).json({ success: true, data: role });
});

// @desc    Update role
// @route   PUT /api/roles/:id
const updateRole = asyncHandler(async (req, res) => {
  const role = await Role.findById(req.params.id);
  if (!role) return res.status(404).json({ success: false, message: 'Role not found' });

  if (role.isSystem && req.body?.name && String(req.body.name).toUpperCase() !== role.name) {
    return res.status(400).json({ success: false, message: 'System role name cannot be changed' });
  }

  if (req.body?.name) role.name = String(req.body.name).toUpperCase();
  if (req.body?.description !== undefined) role.description = req.body.description;
  if (req.body?.permissions) role.permissions = req.body.permissions;

  role.isSystem = isSystemRoleName(role.name);
  await role.save();
  res.json({ success: true, data: role });
});

// @desc    Delete role
// @route   DELETE /api/roles/:id
const deleteRole = asyncHandler(async (req, res) => {
  const role = await Role.findById(req.params.id);
  if (!role) return res.status(404).json({ success: false, message: 'Role not found' });
  if (role.isSystem) {
    return res.status(400).json({ success: false, message: 'System roles cannot be deleted' });
  }

  await role.deleteOne();
  res.json({ success: true, message: 'Role deleted' });
});

module.exports = { getRoles, getRoleMatrix, createRole, updateRole, deleteRole };
