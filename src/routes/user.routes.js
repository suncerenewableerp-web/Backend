const express = require('express');
const { verifyToken } = require('../middleware/auth.middleware');
const { getUsers, getEngineers } = require('../controllers/user.controller');
const { asyncHandler } = require('../middleware/error.middleware');
const { validateTicketId } = require('../middleware/validate.middleware'); // Reuse

const router = express.Router();

router.use(verifyToken); // All users routes protected

router.get('/', asyncHandler(getUsers));
router.get('/engineers', asyncHandler(getEngineers));

module.exports = router;

