const express = require('express');
const { verifyToken, authorize } = require('../middleware/auth.middleware');
const { getReports } = require('../controllers/report.controller');
const { asyncHandler } = require('../middleware/error.middleware');

const router = express.Router();

router.use(verifyToken);
router.use(authorize('reports', 'view'));

router.get('/', asyncHandler(getReports));
router.get('/export/tickets', asyncHandler((req, res) => {
  res.json({ success: true, message: 'CSV export ready' });
}));

module.exports = router;

