import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { fileURLToPath } from "url";

import { authMiddleware, requireAdmin } from "./middleware/auth.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { authLimiter, apiLimiter } from "./middleware/limits.js";

import authRouter from "./routes/auth.js";
import accountRouter from "./routes/account.js";
import goalsRouter from "./routes/goals.js";
import mealsRouter from "./routes/meals.js";
import workoutsRouter, { workoutsTemplateHandler } from "./routes/workouts.js";
import healthRouter from "./routes/health.js";
import progressRouter from "./routes/progress.js";
import waterRouter from "./routes/water.js";
import adminRouter from "./routes/admin.js";

const app = express();

app.disable("x-powered-by");

// CSP is off because Vite's inline scripts need a tuned directive set
// (follow-up); every other helmet default is on.
app.use(helmet({ contentSecurityPolicy: false }));

// Trust one proxy hop (Vercel edge / reverse proxy) so req.ip and req.secure are
// the client's, not the proxy's — the rate limiters depend on it.
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
app.get("/api/workouts/template", workoutsTemplateHandler); // public, must precede the authed router
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
  const distPath = fileURLToPath(new URL("../src/dist", import.meta.url));
  app.use(express.static(distPath));
  // SPA fallback skips /api/* so API typos still 404 instead of returning index.html
  app.get(/^(?!\/api\/).*/, (req, res) => {
    res.sendFile("index.html", { root: distPath });
  });
}

app.use(errorHandler);

export default app;
