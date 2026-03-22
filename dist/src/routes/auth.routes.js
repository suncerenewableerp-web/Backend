const express = require('express');
const { signup, login, refresh } = require('../controllers/auth.controller');
const { validate, validateEmail, validatePassword } = require('../middleware/validate.middleware');
const authLimiter = require('express-rate-limit')({ windowMs: 15*60*1000, max: 5 });

const router = express.Router();

router.post('/signup', validate([validateEmail, validatePassword]), signup);
router.post('/login', authLimiter, login);
router.post('/refresh', refresh);

module.exports = router;

