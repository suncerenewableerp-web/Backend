"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
require("dotenv/config");
const User_model_1 = __importDefault(require("../models/User.model"));
const emailAddress_1 = require("../utils/emailAddress");
function usage() {
    // Intentionally do not print passwords.
    console.log("Usage: npm run reset:password -- <email> <newPassword>");
    console.log("Example: npm run reset:password -- admin@sunce.in admin123");
}
async function main() {
    const [, , emailRaw, newPasswordRaw] = process.argv;
    const email = (0, emailAddress_1.normalizeEmailForStorage)(emailRaw);
    const newPassword = String(newPasswordRaw || "");
    if (!email || !email.includes("@") || !newPassword || newPassword.length < 6) {
        usage();
        process.exit(1);
    }
    const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/sunce_erp";
    await mongoose_1.default.connect(uri);
    const user = await User_model_1.default.findOne({
        email: { $in: (0, emailAddress_1.emailLookupCandidates)(emailRaw) },
        isActive: true,
    })
        .collation({ locale: "en", strength: 2 })
        .select("+password");
    if (!user) {
        console.error("User not found (or inactive).");
        process.exit(1);
    }
    user.password = newPassword;
    await user.save();
    console.log(`Password reset OK for ${user.email}`);
    process.exit(0);
}
main().catch((err) => {
    console.error("Reset password failed:", err);
    process.exit(1);
});
