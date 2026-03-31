import fs from "fs";
import path from "path";
import multer from "multer";

function ensureDir(dir: string) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    // ignore
  }
}

function safeFilenameSegment(value: string) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

// Store uploads in `backend/uploads` so the existing `/uploads` static mapping works.
const UPLOAD_ROOT = path.resolve(process.cwd(), "..", "uploads");
const PICKUP_DIR = path.join(UPLOAD_ROOT, "pickup");
ensureDir(PICKUP_DIR);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, PICKUP_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "");
    const base = safeFilenameSegment(path.basename(file.originalname || "file", ext)) || "file";
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

export const pickupDocumentUpload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
  fileFilter: (_req, file, cb) => {
    if (!allowedMimes.has(String(file.mimetype || "").toLowerCase())) {
      const err: any = new Error("Only PDF and image uploads are allowed.");
      err.statusCode = 400;
      cb(err);
      return;
    }
    cb(null, true);
  },
});
