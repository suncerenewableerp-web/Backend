"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pickupDocumentUpload = void 0;
const multer_1 = __importDefault(require("multer"));
const allowedMimes = new Set([
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
]);
exports.pickupDocumentUpload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
    fileFilter: (_req, file, cb) => {
        if (!allowedMimes.has(String(file.mimetype || "").toLowerCase())) {
            const err = new Error("Only PDF and image uploads are allowed.");
            err.statusCode = 400;
            cb(err);
            return;
        }
        cb(null, true);
    },
});
