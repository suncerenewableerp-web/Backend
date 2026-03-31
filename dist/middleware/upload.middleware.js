"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pickupDocumentUpload = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const multer_1 = __importDefault(require("multer"));
function ensureDir(dir) {
    try {
        fs_1.default.mkdirSync(dir, { recursive: true });
    }
    catch {
        // ignore
    }
}
function safeFilenameSegment(value) {
    return String(value || "")
        .trim()
        .replace(/[^a-zA-Z0-9._-]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 80);
}
// Store uploads in `backend/uploads` so the existing `/uploads` static mapping works.
const UPLOAD_ROOT = path_1.default.resolve(process.cwd(), "..", "uploads");
const PICKUP_DIR = path_1.default.join(UPLOAD_ROOT, "pickup");
ensureDir(PICKUP_DIR);
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => cb(null, PICKUP_DIR),
    filename: (req, file, cb) => {
        const ext = path_1.default.extname(file.originalname || "");
        const base = safeFilenameSegment(path_1.default.basename(file.originalname || "file", ext)) || "file";
        const ticketId = safeFilenameSegment(String(req.params?.id || "")) || "ticket";
        const stamp = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
        cb(null, `${ticketId}_${stamp}_${base}${ext}`);
    },
});
const allowedMimes = new Set([
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
]);
exports.pickupDocumentUpload = (0, multer_1.default)({
    storage,
    limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
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
