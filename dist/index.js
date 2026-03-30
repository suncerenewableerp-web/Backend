"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const mongoose_1 = __importDefault(require("mongoose"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
// Load `.env` reliably whether running `src` (ts-node) or `dist` (node).
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, "..", ".env") });
// Import routes (will create later)
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const user_routes_1 = __importDefault(require("./routes/user.routes"));
const ticket_routes_1 = __importDefault(require("./routes/ticket.routes"));
const role_routes_1 = __importDefault(require("./routes/role.routes"));
const logistics_routes_1 = __importDefault(require("./routes/logistics.routes"));
const jobcard_routes_1 = __importDefault(require("./routes/jobcard.routes"));
const sla_routes_1 = __importDefault(require("./routes/sla.routes"));
const settings_routes_1 = __importDefault(require("./routes/settings.routes"));
const report_routes_1 = __importDefault(require("./routes/report.routes"));
const dashboard_routes_1 = __importDefault(require("./routes/dashboard.routes"));
// Import middleware (will create later)
const error_middleware_1 = require("./middleware/error.middleware");
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
// If you deploy behind a reverse proxy / load balancer, enable trust proxy so
// rate-limiting and req.ip work per-client (instead of all users sharing one IP).
const parseTrustProxy = (value) => {
    if (value === undefined || value === null)
        return undefined;
    const normalized = String(value).trim().toLowerCase();
    if (normalized === "")
        return undefined;
    if (normalized === "true")
        return true;
    if (normalized === "false")
        return false;
    const asInt = Number.parseInt(normalized, 10);
    if (Number.isFinite(asInt) && String(asInt) === normalized)
        return asInt;
    return value;
};
const trustProxy = parseTrustProxy(process.env.TRUST_PROXY);
if (trustProxy !== undefined)
    app.set("trust proxy", trustProxy);
if (process.env.NODE_ENV === "production" && trustProxy === undefined) {
    // In production deployments (Vercel/Render/Nginx), we almost always sit behind
    // a reverse proxy. Defaulting to `1` prevents all users sharing the same IP
    // (which can cause rate limits to hit unexpectedly under concurrency).
    app.set("trust proxy", 1);
}
// ─── SECURITY MIDDLEWARE ──────────────────────────────────────────────────────
app.use((0, helmet_1.default)());
// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use((0, cors_1.default)({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
}));
// ─── RATE LIMITING ────────────────────────────────────────────────────────────
const limiter = (0, express_rate_limit_1.default)({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX) || 1000,
    standardHeaders: true,
    legacyHeaders: false,
    // Auth has dedicated (more nuanced) limits in `routes/auth.routes.ts`
    skip: (req) => req.path.startsWith("/auth"),
    message: { success: false, message: "Too many requests, please try again later." },
});
app.use("/api", limiter);
// ─── BODY PARSER ─────────────────────────────────────────────────────────────
app.use(express_1.default.json({ limit: "10mb" }));
app.use(express_1.default.urlencoded({ extended: true, limit: "10mb" }));
// ─── LOGGING ─────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== "test") {
    app.use((0, morgan_1.default)(process.env.NODE_ENV === "production" ? "combined" : "dev"));
}
// ─── STATIC FILES ─────────────────────────────────────────────────────────────
app.use("/uploads", express_1.default.static("../uploads"));
// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
    const conn = mongoose_1.default.connection;
    res.json({
        success: true,
        message: "Sunce ERP API is running",
        environment: process.env.NODE_ENV,
        timestamp: new Date().toISOString(),
        version: "1.0.0",
        db: {
            readyState: conn.readyState, // 0=disconnected,1=connected,2=connecting,3=disconnecting
            name: conn.name,
            host: conn.host,
            port: conn.port,
        },
    });
});
// ─── API ROUTES ───────────────────────────────────────────────────────────────
app.use("/api/auth", auth_routes_1.default);
app.use("/api/users", user_routes_1.default);
app.use("/api/tickets", ticket_routes_1.default);
app.use("/api/roles", role_routes_1.default);
app.use("/api/logistics", logistics_routes_1.default);
app.use("/api/jobcards", jobcard_routes_1.default);
app.use("/api/sla", sla_routes_1.default);
app.use("/api/settings", settings_routes_1.default);
app.use("/api/reports", report_routes_1.default);
app.use("/api/dashboard", dashboard_routes_1.default);
// ─── 404 HANDLER ─────────────────────────────────────────────────────────────
app.use("*", (req, res) => {
    res.status(404).json({
        success: false,
        message: `Route ${req.originalUrl} not found`,
    });
});
// ─── GLOBAL ERROR HANDLER ─────────────────────────────────────────────────────
app.use(error_middleware_1.errorHandler);
// ─── DATABASE + SERVER ───────────────────────────────────────────────────────
mongoose_1.default
    .connect(process.env.MONGODB_URI || "mongodb://localhost:27017/sunce_erp")
    .then(() => {
    console.log("✅ MongoDB connected successfully");
    app.listen(PORT, () => {
        console.log(`🚀 Sunce ERP API running on http://localhost:${PORT}`);
        console.log(`📖 Health check: http://localhost:${PORT}/health`);
        console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
    });
})
    .catch((err) => {
    console.error("❌ MongoDB connection failed:", err.message);
    process.exit(1);
});
exports.default = app;
