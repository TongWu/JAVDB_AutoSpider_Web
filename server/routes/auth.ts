import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";
import { signJwt, verifyJwt } from "../services/jwt";
import { findUser } from "../services/users";
import { checkRateLimit } from "../services/rate-limit";
import { revokeToken, isTokenRevoked, trackSession, getSessionCount, cleanExpiredSessions, removeSession } from "../services/token-revocation";
import { requireAuth } from "../middleware/auth";
import { saveConfigKeys } from "../services/config-store";

type AuthEnv = { Bindings: Env };

export const authRoutes = new Hono<AuthEnv>();

export async function verifyPassword(password: string, hash: string, environment: string): Promise<boolean> {
  if (hash.startsWith("plain:")) {
    if (environment === "production") {
      console.warn("plain-text passwords are rejected in production — use bcrypt hash");
      return false;
    }
    return password === hash.slice(6);
  }
  const { compare } = await import("bcryptjs");
  return compare(password, hash);
}

function getExpiry(env: Env, type: "access" | "refresh"): number {
  if (type === "access") {
    return parseInt(env.ACCESS_TOKEN_EXPIRE_SECONDS ?? "1800", 10);
  }
  return parseInt(env.REFRESH_TOKEN_EXPIRE_SECONDS ?? "604800", 10);
}

function generateCsrfToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("").slice(0, 24);
}

function getClientIp(c: { req: { header: (name: string) => string | undefined } }): string {
  return c.req.header("CF-Connecting-IP") ?? c.req.header("X-Forwarded-For")?.split(",")[0].trim() ?? "unknown";
}

const MAX_SESSIONS_PER_USER = 3;

authRoutes.post("/login", async (c) => {
  // Rate limit: 5 requests / 60s per IP
  const ip = getClientIp(c);
  const rl = await checkRateLimit(c.env.AUTH_KV, ip, "/api/auth/login", 5, 60);
  if (!rl.allowed) {
    return c.json(
      { error: { code: "rate_limited", message: "Too many login attempts" } },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  const body = await c.req.json<{ username: string; password: string }>();
  if (!body.username || !body.password) {
    throw new HTTPException(400, { message: "username and password required" });
  }

  const user = await findUser(c.env, c.env.OPERATIONS_DB, body.username);
  if (!user) {
    throw new HTTPException(401, { message: "Invalid username/password" });
  }

  const valid = await verifyPassword(body.password, user.passwordHash, c.env.ENVIRONMENT);
  if (!valid) {
    throw new HTTPException(401, { message: "Invalid username/password" });
  }

  // Session limit check (best-effort; KV has no transactions, so concurrent logins may briefly exceed the limit)
  await cleanExpiredSessions(c.env.AUTH_KV, user.username);
  const sessionCount = await getSessionCount(c.env.AUTH_KV, user.username);
  if (sessionCount >= MAX_SESSIONS_PER_USER) {
    return c.json(
      { error: { code: "session_limit", message: "Maximum concurrent sessions reached" } },
      { status: 429 },
    );
  }

  const accessExpiry = getExpiry(c.env, "access");
  const refreshExpiry = getExpiry(c.env, "refresh");
  const claims = { sub: user.username, role: user.role };

  const accessToken = await signJwt({ ...claims, typ: "access" }, c.env.API_SECRET_KEY, accessExpiry);
  const refreshToken = await signJwt({ ...claims, typ: "refresh" }, c.env.API_SECRET_KEY, refreshExpiry);
  const csrfToken = generateCsrfToken();

  // Track session (use access token JTI for revocation; refresh token JTI for session tracking)
  const refreshPayload = JSON.parse(atob(refreshToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
  await trackSession(c.env.AUTH_KV, user.username, refreshPayload.jti, refreshPayload.exp);

  const isSecure = new URL(c.req.url).protocol === "https:";
  const sameSite = "Lax";
  const cookieFlags = `Path=/; HttpOnly; SameSite=${sameSite}${isSecure ? "; Secure" : ""}`;
  const csrfFlags = `Path=/; SameSite=${sameSite}${isSecure ? "; Secure" : ""}`;

  c.header("Set-Cookie", `access_token=${accessToken}; Max-Age=${accessExpiry}; ${cookieFlags}`, { append: true });
  c.header("Set-Cookie", `csrf_token=${csrfToken}; Max-Age=${accessExpiry}; ${csrfFlags}`, { append: true });

  return c.json({
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: "bearer",
    expires_in: accessExpiry,
    csrf_token: csrfToken,
    role: user.role,
    username: user.username,
  });
});

authRoutes.post("/refresh", async (c) => {
  // Rate limit: 10 requests / 60s per IP
  const ip = getClientIp(c);
  const rl = await checkRateLimit(c.env.AUTH_KV, ip, "/api/auth/refresh", 10, 60);
  if (!rl.allowed) {
    return c.json(
      { error: { code: "rate_limited", message: "Too many refresh attempts" } },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  const authHeader = c.req.header("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    throw new HTTPException(401, { message: "Refresh token required" });
  }

  let payload;
  try {
    payload = await verifyJwt(token, c.env.API_SECRET_KEY);
  } catch {
    throw new HTTPException(401, { message: "Invalid token" });
  }

  if (payload.typ !== "refresh") {
    throw new HTTPException(401, { message: "Refresh token required" });
  }

  // Check if refresh token was revoked
  const revoked = await isTokenRevoked(c.env.AUTH_KV, payload.jti);
  if (revoked) {
    throw new HTTPException(401, { message: "Token has been revoked" });
  }

  const user = await findUser(c.env, c.env.OPERATIONS_DB, payload.sub);
  if (!user) {
    throw new HTTPException(401, { message: "Unknown user" });
  }

  const accessExpiry = getExpiry(c.env, "access");
  const accessToken = await signJwt(
    { sub: user.username, role: user.role, typ: "access" },
    c.env.API_SECRET_KEY,
    accessExpiry,
  );

  // Generate fresh CSRF token and re-set cookie
  const csrfToken = generateCsrfToken();
  const isSecure = new URL(c.req.url).protocol === "https:";
  const sameSite = "Lax";
  const cookieFlags = `Path=/; HttpOnly; SameSite=${sameSite}${isSecure ? "; Secure" : ""}`;
  const csrfFlags = `Path=/; SameSite=${sameSite}${isSecure ? "; Secure" : ""}`;

  c.header("Set-Cookie", `access_token=${accessToken}; Max-Age=${accessExpiry}; ${cookieFlags}`, { append: true });
  c.header("Set-Cookie", `csrf_token=${csrfToken}; Max-Age=${accessExpiry}; ${csrfFlags}`, { append: true });

  return c.json({
    access_token: accessToken,
    token_type: "bearer",
    expires_in: accessExpiry,
    csrf_token: csrfToken,
  });
});

authRoutes.post("/logout", async (c) => {
  // Extract access token to revoke its JTI
  const authHeader = c.req.header("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (token) {
    try {
      const payload = await verifyJwt(token, c.env.API_SECRET_KEY);
      const ttl = payload.exp - Math.floor(Date.now() / 1000);
      if (ttl > 0) {
        await revokeToken(c.env.AUTH_KV, payload.jti, ttl);
      }
      await removeSession(c.env.AUTH_KV, payload.sub, payload.jti);
    } catch {
      // Token may be invalid or expired — still clear cookies
    }
  }

  c.header("Set-Cookie", "access_token=; Max-Age=0; Path=/; HttpOnly", { append: true });
  c.header("Set-Cookie", "csrf_token=; Max-Age=0; Path=/", { append: true });
  return c.json({ status: "ok" });
});

authRoutes.post("/change-password", requireAuth(), async (c) => {
  const body = await c.req.json<{ old_password: string; new_password: string }>();
  if (!body.old_password || !body.new_password) {
    throw new HTTPException(400, { message: "old_password and new_password required" });
  }
  if (body.new_password.length < 8) {
    throw new HTTPException(400, { message: "new_password must be at least 8 characters" });
  }

  const jwtUser = c.get("user");
  const user = await findUser(c.env, c.env.OPERATIONS_DB, jwtUser.sub);
  if (!user) {
    throw new HTTPException(401, { message: "Unknown user" });
  }

  const valid = await verifyPassword(body.old_password, user.passwordHash, c.env.ENVIRONMENT);
  if (!valid) {
    throw new HTTPException(401, { message: "Current password is incorrect" });
  }

  const { hash } = await import("bcryptjs");
  const newHash = await hash(body.new_password, 10);

  const hashKey = user.role === "admin" ? "ADMIN_PASSWORD_HASH" : "READONLY_PASSWORD_HASH";
  await saveConfigKeys(c.env.OPERATIONS_DB, { [hashKey]: newHash });

  return c.json({ status: "ok" });
});
