const express = require('express');
const { verifyToken } = require('../middleware/auth.middleware');
const { getRoles, getRoleMatrix, createRole, updateRole, deleteRole } = require('../controllers/role.controller');
const { asyncHandler } = require('../middleware/error.middleware');

const router = express.Router();

router.get('/public', asyncHandler(getRoles));

router.use(verifyToken);

const requireAdmin = (req, res, next) => {
  if (req.user?.role?.name !== 'ADMIN') {
    return res.status(403).json({ success: false, message: 'Admin only' });
  }
  next();
};

router.get('/', asyncHandler(getRoles));
router.get('/matrix', asyncHandler(getRoleMatrix));
router.post('/', requireAdmin, asyncHandler(createRole));
router.put('/:id', requireAdmin, asyncHandler(updateRole));
router.delete('/:id', requireAdmin, asyncHandler(deleteRole));

module.exports = router;
