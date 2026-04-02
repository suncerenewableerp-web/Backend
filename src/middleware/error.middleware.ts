import type { NextFunction, Request, Response } from "express";

// Async handler wrapper
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => unknown) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

// Global error handler
export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  void next;
  console.error("❌ Error:", err?.stack || err);

  // Multer errors (file uploads)
  if (err?.name === "MulterError") {
    const msg =
      err?.code === "LIMIT_FILE_SIZE"
        ? "File too large. Max 2MB."
        : err?.message || "Upload failed";
    return res.status(400).json({ success: false, message: msg });
  }

  // Validation errors
  if (err?.name === "ValidationError") {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: err?.errors,
    });
  }

  // Mongoose errors
  if (err?.name === "MongoError" || err?.code === 11000) {
    return res.status(400).json({
      success: false,
      message: "Duplicate field value entered",
    });
  }

  // JWT errors
  if (err?.name === "JsonWebTokenError") {
    return res.status(401).json({
      success: false,
      message: "Invalid token",
    });
  }

  // Generic
  res.status(err?.statusCode || 500).json({
    success: false,
    message: err?.message || "Server Error",
  });
};
