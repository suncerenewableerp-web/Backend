"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = exports.asyncHandler = void 0;
// Async handler wrapper
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};
exports.asyncHandler = asyncHandler;
// Global error handler
const errorHandler = (err, req, res, next) => {
    void next;
    console.error("❌ Error:", err?.stack || err);
    // Multer errors (file uploads)
    if (err?.name === "MulterError") {
        const msg = err?.code === "LIMIT_FILE_SIZE"
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
exports.errorHandler = errorHandler;
