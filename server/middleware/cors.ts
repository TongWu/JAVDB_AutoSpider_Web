import { cors } from "hono/cors";
import type { Env } from "../env";
import type { MiddlewareHandler } from "hono";

export function corsMiddleware(): MiddlewareHandler<{ Bindings: Env }> {
  return cors({
    origin: (origin) => origin ?? "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-CSRF-Token", "X-Request-Id"],
    credentials: true,
    maxAge: 86400,
  });
}
