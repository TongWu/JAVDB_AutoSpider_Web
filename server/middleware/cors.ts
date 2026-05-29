import { cors } from "hono/cors";
import type { Env } from "../env";
import type { MiddlewareHandler } from "hono";

function getAllowedOrigins(env: Env): string[] {
  const isProduction = env.ENVIRONMENT === "production";

  if (isProduction) {
    const raw = (env as unknown as Record<string, string | undefined>).CORS_ORIGINS ?? "";
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  // Dev/test: allow localhost variants
  return [
    "http://localhost:5173",
    "http://localhost:8788",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:8788",
  ];
}

export function corsMiddleware(): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    const allowed = getAllowedOrigins(c.env);
    const mw = cors({
      origin: (origin) => {
        if (!origin) return "";
        if (allowed.length === 0) return "";
        if (allowed.includes(origin)) return origin;
        // Dev mode: also match any localhost port
        if (c.env.ENVIRONMENT !== "production") {
          try {
            const url = new URL(origin);
            if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return origin;
          } catch { /* invalid origin */ }
        }
        return "";
      },
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization", "X-CSRF-Token", "X-Request-Id"],
      credentials: true,
      maxAge: 86400,
    });
    return mw(c, next);
  };
}
