const express = require('express');
const { verifyToken, authorize } = require('../middleware/auth.middleware');
const { getDashboard } = require('../controllers/dashboard.controller');
const { asyncHandler } = require('../middleware/error.middleware');

const router = express.Router();

router.use(verifyToken);
router.use(authorize('dashboard', 'view'));

router.get('/', asyncHandler(getDashboard));

module.exports = router;

