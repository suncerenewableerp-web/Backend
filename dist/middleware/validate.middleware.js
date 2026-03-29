"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validatePassword = exports.validateEmail = exports.validateTicketId = exports.validate = void 0;
// Generic validation middleware - attach to routes
const express_validator_1 = require("express-validator");
const validate = (validations) => {
    return async (req, res, next) => {
        void res;
        await Promise.all(validations.map((validation) => validation.run(req)));
        const errors = (0, express_validator_1.validationResult)(req);
        if (errors.isEmpty()) {
            return next();
        }
        // Throw validation error (handled by error.middleware)
        const error = new Error("Validation failed");
        error.name = "ValidationError";
        error.errors = errors.array();
        throw error;
    };
};
exports.validate = validate;
// Common validators
exports.validateTicketId = (0, express_validator_1.param)("id").isMongoId().withMessage("Valid ticket ID required");
exports.validateEmail = (0, express_validator_1.body)("email").isEmail().normalizeEmail().withMessage("Valid email required");
exports.validatePassword = (0, express_validator_1.body)("password").isLength({ min: 6 }).withMessage("Password must be at least 6 chars");
