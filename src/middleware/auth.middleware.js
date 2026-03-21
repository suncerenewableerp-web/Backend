const jwt = require('jsonwebtoken');
const User = require('../models/User.model');
const Role = require('../models/Role.model');

// Verify JWT token
const { asyncHandler } = require('./error.middleware');
const verifyToken = asyncHandler(async (req, res, next) => {
  let token = req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. No token provided.'
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).populate('role');
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token.'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      message: 'Invalid token.'
    });
  }
});

// Check permissions: authorize(module, action)
const authorize = (module, action) => {
  return asyncHandler(async (req, res, next) => {
    const role = req.user.role;
    
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

module.exports = { verifyToken, authorize };

