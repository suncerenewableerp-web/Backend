"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cloudinary = void 0;
exports.ensureCloudinaryConfigured = ensureCloudinaryConfigured;
const cloudinary_1 = require("cloudinary");
Object.defineProperty(exports, "cloudinary", { enumerable: true, get: function () { return cloudinary_1.v2; } });
let configured = false;
function ensureCloudinaryConfigured() {
    if (configured)
        return;
    const cloudName = String(process.env.CLOUDINARY_CLOUD_NAME || "").trim();
    const apiKey = String(process.env.CLOUDINARY_API_KEY || "").trim();
    const apiSecret = String(process.env.CLOUDINARY_API_SECRET || "").trim();
    if (!cloudName || !apiKey || !apiSecret) {
        const missing = [
            !cloudName ? "CLOUDINARY_CLOUD_NAME" : null,
            !apiKey ? "CLOUDINARY_API_KEY" : null,
            !apiSecret ? "CLOUDINARY_API_SECRET" : null,
        ].filter(Boolean);
        const err = new Error(`Missing Cloudinary env vars: ${missing.join(", ")}`);
        err.statusCode = 500;
        throw err;
    }
    cloudinary_1.v2.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
        secure: true,
    });
    configured = true;
}
