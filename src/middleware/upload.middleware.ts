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

export const installationDocumentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    const mime = String(file.mimetype || "").toLowerCase();
    if (mime !== "application/pdf") {
      const err: any = new Error("Only PDF uploads are allowed.");
      err.statusCode = 400;
      cb(err);
      return;
    }
    cb(null, true);
  },
});
