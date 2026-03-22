const express = require('express');
const { verifyToken, authorize } = require('../middleware/auth.middleware');
const { getLogistics, createLogistics, updateTracking } = require('../controllers/logistics.controller');
const { asyncHandler } = require('../middleware/error.middleware');

const router = express.Router();

router.use(verifyToken);

router.get('/', authorize('logistics', 'view'), asyncHandler(getLogistics));
router.post('/', authorize('logistics', 'create'), asyncHandler(createLogistics));
router.put('/:id', authorize('logistics', 'edit'), asyncHandler(updateTracking));
router.get('/ticket/:ticketId', asyncHandler((req, res) => res.json({ success: true, data: [] })));

module.exports = router;

