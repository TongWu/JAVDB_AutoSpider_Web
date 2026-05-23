import { Hono } from "hono";
import type { Env } from "./env";
import type { JwtPayload } from "./services/jwt";
import { corsMiddleware } from "./middleware/cors";
import { requireAuth } from "./middleware/auth";
import { authRoutes } from "./routes/auth";

type AppEnv = { Bindings: Env; Variables: { user: JwtPayload } };

export const app = new Hono<AppEnv>();

app.use("*", corsMiddleware());

// Public routes
app.route("/api/auth", authRoutes);

// Protected routes (auth required)
app.use("/api/*", requireAuth());

// Placeholder — capabilities route added in Task 5
app.get("/api/capabilities", (c) => {
  return c.json({
    version: "2.0.0",
    ingestion_mode: c.env.INGESTION_MODE ?? "local",
    storage_backend: "d1",
    deployment: "cloudflare",
  });
});

// 404 fallback for API routes
app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));
