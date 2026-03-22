const express = require('express');
const { verifyToken, authorize } = require('../middleware/auth.middleware');
const { getJobCards, createJobCard, addPart } = require('../controllers/jobcard.controller');
const { asyncHandler } = require('../middleware/error.middleware');

const router = express.Router();

router.use(verifyToken);
router.use(authorize('jobcard', 'view'));

router.get('/', asyncHandler(getJobCards));
router.post('/', authorize('jobcard', 'create'), asyncHandler(createJobCard));
router.post('/:id/parts', authorize('jobcard', 'edit'), asyncHandler(addPart));

module.exports = router;

