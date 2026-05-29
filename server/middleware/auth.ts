import type { Context, MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";
import { verifyJwt, type JwtPayload } from "../services/jwt";
import { isTokenRevoked } from "../services/token-revocation";

type HonoEnv = { Bindings: Env; Variables: { user: JwtPayload } };

function extractToken(c: Context): string | null {
  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  const cookie = c.req.header("Cookie");
  if (cookie) {
    const match = cookie.match(/(?:^|;\s*)access_token=([^;]+)/);
    if (match) return match[1];
  }
  return null;
}

function extractCsrf(c: Context): { header: string | null; cookie: string | null } {
  const header = c.req.header("X-CSRF-Token") ?? null;
  const cookieStr = c.req.header("Cookie");
  let cookie: string | null = null;
  if (cookieStr) {
    const match = cookieStr.match(/(?:^|;\s*)csrf_token=([^;]+)/);
    if (match) cookie = match[1];
  }
  return { header, cookie };
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  let result = 0;
  for (let i = 0; i < bufA.length; i++) {
    result |= bufA[i] ^ bufB[i];
  }
  return result === 0;
}

export function requireAuth(): MiddlewareHandler<HonoEnv> {
  return async (c, next) => {
    const token = extractToken(c);
    if (!token) {
      throw new HTTPException(401, { message: "Missing bearer token" });
    }

    let payload: JwtPayload;
    try {
      payload = await verifyJwt(token, c.env.API_SECRET_KEY);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Invalid token";
      throw new HTTPException(401, { message: msg });
    }

    if (payload.typ !== "access") {
      throw new HTTPException(401, { message: "Access token required" });
    }

    const method = c.req.method;
    const isMutation = method === "POST" || method === "PUT" || method === "DELETE";

    // Check token revocation on mutation requests only
    if (isMutation) {
      const revoked = await isTokenRevoked(c.env.AUTH_KV, payload.jti);
      if (revoked) {
        throw new HTTPException(401, { message: "Token has been revoked" });
      }
    }

    // CSRF check for mutating methods
    if (isMutation) {
      const path = new URL(c.req.url).pathname;
      if (path !== "/api/auth/login") {
        const csrf = extractCsrf(c);
        if (!csrf.header || !csrf.cookie || !timingSafeEqual(csrf.header, csrf.cookie)) {
          throw new HTTPException(403, { message: "CSRF token invalid" });
        }
      }
    }

    c.set("user", payload);
    await next();
  };
}

export function requireRole(role: string): MiddlewareHandler<HonoEnv> {
  return async (c, next) => {
    const user = c.get("user");
    if (user.role !== role) {
      throw new HTTPException(403, { message: `${role} role required` });
    }
    await next();
  };
}
