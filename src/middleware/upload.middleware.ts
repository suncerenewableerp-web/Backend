import multer from "multer";

const allowedMimes = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

export const pickupDocumentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
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
