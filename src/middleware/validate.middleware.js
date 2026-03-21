// Generic validation middleware - attach to routes
const { body, param, query, validationResult } = require('express-validator');

const validate = (validations) => {
  return async (req, res, next) => {
    await Promise.all(validations.map(validation => validation.run(req)));

    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }

    // Throw validation error (handled by error.middleware)
    const error = new Error('Validation failed');
    error.name = 'ValidationError';
    error.errors = errors.array();
    throw error;
  };
};

// Common validators
const validateTicketId = param('id').isMongoId().withMessage('Valid ticket ID required');
const validateEmail = body('email').isEmail().normalizeEmail().withMessage('Valid email required');
const validatePassword = body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 chars');

module.exports = { validate, validateTicketId, validateEmail, validatePassword };

