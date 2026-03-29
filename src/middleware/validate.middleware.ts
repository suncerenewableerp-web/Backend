// Generic validation middleware - attach to routes
import { body, param, validationResult } from "express-validator";
import type { NextFunction, Request, Response } from "express";

export const validate = (validations: any[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    void res;
    await Promise.all(validations.map((validation) => validation.run(req)));

    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }

    // Throw validation error (handled by error.middleware)
    const error: any = new Error("Validation failed");
    error.name = "ValidationError";
    error.errors = errors.array();
    throw error;
  };
};

// Common validators
export const validateTicketId = param("id").isMongoId().withMessage("Valid ticket ID required");
export const validateEmail = body("email").isEmail().normalizeEmail().withMessage("Valid email required");
export const validatePassword = body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 chars");

