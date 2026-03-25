const express = require('express');
const { verifyToken } = require('../middleware/auth.middleware');
const { asyncHandler } = require('../middleware/error.middleware');
const { getSlaSettings, updateSlaSettings } = require('../controllers/settings.controller');

const router = express.Router();

router.use(verifyToken);

const requireAdmin = (req, res, next) => {
  if (req.user?.role?.name !== 'ADMIN') {
    return res.status(403).json({ success: false, message: 'Admin only' });
  }
  next();
};

router.get('/sla', asyncHandler(getSlaSettings));
router.put('/sla', requireAdmin, asyncHandler(updateSlaSettings));

module.exports = router;

