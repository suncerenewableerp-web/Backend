import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import path from "path";

// Load `.env` reliably whether running `src` (ts-node) or `dist` (node).
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

// Import routes (will create later)
import authRoutes from "./routes/auth.routes";
import userRoutes from "./routes/user.routes";
import ticketRoutes from "./routes/ticket.routes";
import roleRoutes from "./routes/role.routes";
import logisticsRoutes from "./routes/logistics.routes";
import jobcardRoutes from "./routes/jobcard.routes";
import slaRoutes from "./routes/sla.routes";
import settingsRoutes from "./routes/settings.routes";
import reportRoutes from "./routes/report.routes";
import dashboardRoutes from "./routes/dashboard.routes";

// Import middleware (will create later)
import { errorHandler } from "./middleware/error.middleware";

const app = express();
const PORT = process.env.PORT || 5000;

// If you deploy behind a reverse proxy / load balancer, enable trust proxy so
// rate-limiting and req.ip work per-client (instead of all users sharing one IP).
const parseTrustProxy = (value) => {
  if (value === undefined || value === null) return undefined;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "") return undefined;
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  const asInt = Number.parseInt(normalized, 10);
  if (Number.isFinite(asInt) && String(asInt) === normalized) return asInt;
  return value;
};
const trustProxy = parseTrustProxy(process.env.TRUST_PROXY);
if (trustProxy !== undefined) app.set("trust proxy", trustProxy);
if (process.env.NODE_ENV === "production" && trustProxy === undefined) {
  // In production deployments (Vercel/Render/Nginx), we almost always sit behind
  // a reverse proxy. Defaulting to `1` prevents all users sharing the same IP
  // (which can cause rate limits to hit unexpectedly under concurrency).
  app.set("trust proxy", 1);
}

// ─── SECURITY MIDDLEWARE ──────────────────────────────────────────────────────
app.use(helmet());

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// ─── RATE LIMITING ────────────────────────────────────────────────────────────
const limiter = rateLimit({
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
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ─── LOGGING ─────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== "test") {
  app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
}

// ─── STATIC FILES ─────────────────────────────────────────────────────────────
app.use("/uploads", express.static("../uploads"));

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  const conn = mongoose.connection;
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
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/tickets", ticketRoutes);
app.use("/api/roles", roleRoutes);
app.use("/api/logistics", logisticsRoutes);
app.use("/api/jobcards", jobcardRoutes);
app.use("/api/sla", slaRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/dashboard", dashboardRoutes);

// ─── 404 HANDLER ─────────────────────────────────────────────────────────────
app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
  });
});

// ─── GLOBAL ERROR HANDLER ─────────────────────────────────────────────────────
app.use(errorHandler);

// ─── DATABASE + SERVER ───────────────────────────────────────────────────────
mongoose
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

export default app;
