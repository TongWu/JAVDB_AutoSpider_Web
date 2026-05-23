import { Hono } from "hono";
import type { Env } from "./env";
import type { JwtPayload } from "./services/jwt";
import { corsMiddleware } from "./middleware/cors";
import { requireAuth } from "./middleware/auth";
import { authRoutes } from "./routes/auth";
import { capabilitiesRoutes } from "./routes/capabilities";
import { systemStateRoutes } from "./routes/system-state";

type AppEnv = { Bindings: Env; Variables: { user: JwtPayload } };

export const app = new Hono<AppEnv>();

app.use("*", corsMiddleware());

// Public routes
app.route("/api/auth", authRoutes);

// Protected routes
app.use("/api/*", requireAuth());
app.route("/api/capabilities", capabilitiesRoutes);
app.route("/api/system", systemStateRoutes);

// 404 fallback
app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));
