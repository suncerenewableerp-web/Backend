const express = require('express');
const { signup, login, refresh } = require('../controllers/auth.controller');
const { validate, validateEmail, validatePassword } = require('../middleware/validate.middleware');
const rateLimit = require('express-rate-limit');

const router = express.Router();

const authIpLimiter = rateLimit({
  windowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX, 10) || 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many authentication requests, please try again later.' },
});

// Limits repeated *failed* attempts per (IP + email). Successful logins are not counted.
const loginAttemptLimiter = rateLimit({
  windowMs: parseInt(process.env.LOGIN_ATTEMPT_WINDOW_MS, 10) || 15 * 60 * 1000,
  max: parseInt(process.env.LOGIN_ATTEMPT_MAX, 10) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const ip = req.ip || 'unknown';
    const email = String(req.body?.email || '').trim().toLowerCase();
    return `${ip}|${email || 'no-email'}`;
  },
  skipSuccessfulRequests: true,
  message: { success: false, message: 'Too many failed login attempts, please try again later.' },
});

router.use(authIpLimiter);

router.post('/signup', validate([validateEmail, validatePassword]), signup);
router.post('/login', loginAttemptLimiter, login);
router.post('/refresh', refresh);

module.exports = router;
