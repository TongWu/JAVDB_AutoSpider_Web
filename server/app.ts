import { Hono } from "hono";
import type { Env } from "./env";
import type { JwtPayload } from "./services/jwt";
import { corsMiddleware } from "./middleware/cors";
import { requireAuth } from "./middleware/auth";
import { authRoutes } from "./routes/auth";
import { capabilitiesRoutes } from "./routes/capabilities";
import { systemStateRoutes } from "./routes/system-state";
import { historyRoutes } from "./routes/history";
import { sessionsRoutes } from "./routes/sessions";
import { configRoutes } from "./routes/config";
import { onboardingRoutes } from "./routes/onboarding";
import { diagnosticsRoutes } from "./routes/diagnostics";
import { exploreRoutes } from "./routes/explore";
import { tasksRoutes } from "./routes/tasks";

type AppEnv = { Bindings: Env; Variables: { user: JwtPayload } };

export const app = new Hono<AppEnv>();

app.use("*", corsMiddleware());

// Public routes
app.get("/api/health", (c) => c.json({ status: "ok" }));
app.route("/api/auth", authRoutes);

// Protected routes
app.use("/api/*", requireAuth());
app.route("/api/capabilities", capabilitiesRoutes);
app.route("/api/system", systemStateRoutes);
app.route("/api/history", historyRoutes);
app.route("/api/sessions", sessionsRoutes);
app.route("/api/config", configRoutes);
app.route("/api/onboarding", onboardingRoutes);
app.route("/api/diag", diagnosticsRoutes);
app.route("/api/explore", exploreRoutes);
app.route("/api/tasks", tasksRoutes);

// 404 fallback
app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));
