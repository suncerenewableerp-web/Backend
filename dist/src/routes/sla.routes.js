const express = require('express');
const { verifyToken } = require('../middleware/auth.middleware');
const { getSLAOverview } = require('../controllers/sla.controller');
const { asyncHandler } = require('../middleware/error.middleware');

const router = express.Router();

router.use(verifyToken);

router.get('/', asyncHandler(getSLAOverview));
// router.post('/recalculate', adminOnly, asyncHandler(recalculateSLA));

module.exports = router;

