import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { fileURLToPath } from "url";
import path from "path";

import { authMiddleware, requireAdmin } from "./middleware/auth.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { authLimiter, apiLimiter, passwordChangeLimiter } from "./middleware/limits.js";

import authRouter from "./routes/auth.js";
import accountRouter from "./routes/account.js";
import goalsRouter from "./routes/goals.js";
import mealsRouter from "./routes/meals.js";
import workoutsRouter, { workoutsTemplateHandler } from "./routes/workouts.js";
import healthRouter from "./routes/health.js";
import progressRouter from "./routes/progress.js";
import waterRouter from "./routes/water.js";
import adminRouter from "./routes/admin.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.disable("x-powered-by");

// Helmet sets sensible security headers. CSP is left off because Vite emits
// hashed inline scripts that would need a tuned directive set; tracked as
// follow-up. All other defaults (HSTS, X-Content-Type-Options, X-Frame-Options,
// Referrer-Policy, etc.) are on.
app.use(helmet({ contentSecurityPolicy: false }));

// Trust the first hop of X-Forwarded-* headers (Vercel edge, Render/Proxmox reverse proxies).
// Without this, req.secure is false behind HTTPS-terminating proxies and the rate limiter
// sees every request from the same proxy IP.
app.set("trust proxy", 1);

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
    credentials: true,
  })
);
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());

app.use("/api/auth", authLimiter, authRouter);
app.use("/api/account", authMiddleware, apiLimiter, accountRouter);
app.use("/api/goals", authMiddleware, apiLimiter, goalsRouter);
app.use("/api/meals", authMiddleware, apiLimiter, mealsRouter);
app.get("/api/workouts/template", workoutsTemplateHandler);
app.use("/api/workouts", authMiddleware, apiLimiter, workoutsRouter);
app.use("/api/health", authMiddleware, apiLimiter, healthRouter);
app.use("/api/progress", authMiddleware, apiLimiter, progressRouter);
app.use("/api/water", authMiddleware, apiLimiter, waterRouter);
// apiLimiter runs before requireAdmin so a non-admin spamming /api/admin/*
// consumes their bucket (403s) instead of getting unbounded free 403s.
app.use("/api/admin", authMiddleware, apiLimiter, requireAdmin, adminRouter);

if (process.env.NODE_ENV === "production") {
  // Docker/Proxmox path only — on Vercel, static files are served before this
  // function is invoked (per vercel.json rewrites), so this branch never runs there.
  const distPath = path.join(__dirname, "..", "src", "dist");
  app.use(express.static(distPath));
  // Exclude /api/* from the SPA fallback so API typos return 404, not index.html
  app.get(/^(?!\/api\/).*/, (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

app.use(errorHandler);

export default app;
