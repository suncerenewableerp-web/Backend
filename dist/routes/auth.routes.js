"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const auth_controller_1 = require("../controllers/auth.controller");
const validate_middleware_1 = require("../middleware/validate.middleware");
const router = express_1.default.Router();
const authIpLimiter = (0, express_rate_limit_1.default)({
    windowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
    max: parseInt(process.env.AUTH_RATE_LIMIT_MAX, 10) || 200,
    standardHeaders: true,
    legacyHeaders: false,
    // Many customers can share a single public IP (office NAT). Keying purely by IP
    // can block legitimate concurrent signups/logins, so include email when present.
    keyGenerator: (req) => {
        const ip = req.ip || 'unknown';
        const email = String(req.body?.email || '').trim().toLowerCase();
        return email ? `${ip}|${email}` : ip;
    },
    message: { success: false, message: 'Too many authentication requests, please try again later.' },
});
// Limits repeated *failed* attempts per (IP + email). Successful logins are not counted.
const loginAttemptLimiter = (0, express_rate_limit_1.default)({
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
router.post('/signup', (0, validate_middleware_1.validate)([validate_middleware_1.validateEmail, validate_middleware_1.validatePassword]), auth_controller_1.signup);
router.post('/login', loginAttemptLimiter, auth_controller_1.login);
router.post('/refresh', auth_controller_1.refresh);
exports.default = router;
