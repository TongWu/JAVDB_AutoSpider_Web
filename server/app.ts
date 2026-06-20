import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
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
import { ghActionsRoutes } from "./routes/gh-actions";
import { operationsRoutes } from "./routes/operations";
import { statsRoutes } from "./routes/stats";
import { libraryRoutes } from "./routes/library";
import { libraryOwnershipRoutes } from "./routes/library_ownership";
import { libraryConsumptionRoutes } from "./routes/library_consumption";
import { preferencesRoutes } from "./routes/preferences";
import { watchlistRoutes } from "./routes/watchlist";
import { contentFilterRoutes } from "./routes/content-filter";
import { subscriptionsRoutes } from "./routes/subscriptions";
import { qualityRoutes } from "./routes/quality";
import { stubRoutes } from "./routes/stubs";
import { initializeTables } from "./services/table-init";

type AppEnv = { Bindings: Env; Variables: { user: JwtPayload } };

export const app = new Hono<AppEnv>();

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    const status = err.status;
    let body: unknown;
    try {
      body = JSON.parse(err.message);
    } catch {
      body = { error: { code: "server_error", message: err.message } };
    }
    return c.json(body, status as 400);
  }
  console.error("Unhandled error:", err);
  return c.json(
    { error: { code: "internal_error", message: err.message || "Internal server error" } },
    500,
  );
});

app.use("*", corsMiddleware());

let tablesInitialized = false;

app.use("/api/*", async (c, next) => {
  if (!tablesInitialized) {
    try {
      await initializeTables(c.env);
      tablesInitialized = true;
    } catch (e) {
      console.error("Table initialization failed, will retry on next request:", e);
    }
  }
  await next();
});

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
app.route("/api/gh-actions", ghActionsRoutes);
app.route("/api/ops", operationsRoutes);
app.route("/api/stats", statsRoutes);
app.route("/api/library", libraryRoutes);
app.route("/api/library", libraryOwnershipRoutes);
app.route("/api/library", libraryConsumptionRoutes);
app.route("/api/preferences", preferencesRoutes);
app.route("/api/watchlist", watchlistRoutes);
app.route("/api/content-filter", contentFilterRoutes);
app.route("/api/quality", qualityRoutes);
app.route("/api", subscriptionsRoutes);
app.route("/api", stubRoutes);

// 404 fallback
app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));
