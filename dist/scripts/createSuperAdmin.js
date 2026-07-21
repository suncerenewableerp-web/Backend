"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
require("dotenv/config");
const Role_model_1 = __importDefault(require("../models/Role.model"));
const User_model_1 = __importDefault(require("../models/User.model"));
const MODULES = [
    "dashboard",
    "tickets",
    "jobcard",
    "logistics",
    "sla",
    "reports",
    "users",
    "settings",
];
const fullPermissions = () => Object.fromEntries(MODULES.map((m) => [m, { view: true, create: true, edit: true, delete: true }]));
function usage() {
    console.log("Usage: npm run create:superadmin -- <email>");
    console.log("");
    console.log("Ensures the SUPER_ADMIN role exists with full access, then assigns");
    console.log("it to the user with the given email. Safe to run more than once.");
}
async function main() {
    const email = String(process.argv[2] || process.env.SUPER_ADMIN_EMAIL || "")
        .trim()
        .toLowerCase();
    if (!email || !email.includes("@")) {
        usage();
        process.exit(1);
    }
    const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/sunce_erp";
    await mongoose_1.default.connect(uri, { serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000 });
    // 1. Ensure the role exists, and that its permissions are complete.
    let role = await Role_model_1.default.findOne({ name: "SUPER_ADMIN" });
    if (role) {
        role.permissions = fullPermissions();
        role.description = "Full system access; sole authority to add or remove Admins";
        role.isSystem = true;
        await role.save();
        console.log("✔ SUPER_ADMIN role already existed — permissions refreshed");
    }
    else {
        role = await Role_model_1.default.create({
            name: "SUPER_ADMIN",
            label: "Super Admin",
            description: "Full system access; sole authority to add or remove Admins",
            isSystem: true,
            permissions: fullPermissions(),
        });
        console.log("✔ SUPER_ADMIN role created");
    }
    // 2. Assign it to the requested account.
    const user = await User_model_1.default.findOne({ email }).collation({ locale: "en", strength: 2 });
    if (!user) {
        console.error(`✖ No user found with email ${email}.`);
        console.error("  Create the account first, then re-run this script.");
        await mongoose_1.default.disconnect();
        process.exit(1);
    }
    const previousRole = await Role_model_1.default.findById(user.role).select("name").lean();
    user.role = role._id;
    await user.save();
    console.log(`✔ ${user.name} <${email}> is now SUPER_ADMIN (was ${previousRole?.name || "none"})`);
    await mongoose_1.default.disconnect();
}
main().catch(async (err) => {
    console.error("Failed:", err?.message || err);
    await mongoose_1.default.disconnect().catch(() => { });
    process.exit(1);
});
