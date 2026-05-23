import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";
import { signJwt, verifyJwt } from "../services/jwt";
import { findUser } from "../services/users";

type AuthEnv = { Bindings: Env };

export const authRoutes = new Hono<AuthEnv>();

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (hash.startsWith("plain:")) {
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

authRoutes.post("/login", async (c) => {
  const body = await c.req.json<{ username: string; password: string }>();
  if (!body.username || !body.password) {
    throw new HTTPException(400, { message: "username and password required" });
  }

  const user = findUser(c.env, body.username);
  if (!user) {
    throw new HTTPException(401, { message: "Invalid username/password" });
  }

  const valid = await verifyPassword(body.password, user.passwordHash);
  if (!valid) {
    throw new HTTPException(401, { message: "Invalid username/password" });
  }

  const accessExpiry = getExpiry(c.env, "access");
  const refreshExpiry = getExpiry(c.env, "refresh");
  const claims = { sub: user.username, role: user.role };

  const accessToken = await signJwt({ ...claims, typ: "access" }, c.env.API_SECRET_KEY, accessExpiry);
  const refreshToken = await signJwt({ ...claims, typ: "refresh" }, c.env.API_SECRET_KEY, refreshExpiry);
  const csrfToken = generateCsrfToken();

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

  const user = findUser(c.env, payload.sub);
  if (!user) {
    throw new HTTPException(401, { message: "Unknown user" });
  }

  const accessExpiry = getExpiry(c.env, "access");
  const accessToken = await signJwt(
    { sub: user.username, role: user.role, typ: "access" },
    c.env.API_SECRET_KEY,
    accessExpiry
  );

  const isSecure = new URL(c.req.url).protocol === "https:";
  const sameSite = "Lax";
  const cookieFlags = `Path=/; HttpOnly; SameSite=${sameSite}${isSecure ? "; Secure" : ""}`;
  c.header("Set-Cookie", `access_token=${accessToken}; Max-Age=${accessExpiry}; ${cookieFlags}`);

  return c.json({
    access_token: accessToken,
    token_type: "bearer",
    expires_in: accessExpiry,
  });
});

authRoutes.post("/logout", async (c) => {
  c.header("Set-Cookie", "access_token=; Max-Age=0; Path=/; HttpOnly", { append: true });
  c.header("Set-Cookie", "csrf_token=; Max-Age=0; Path=/", { append: true });
  return c.json({ status: "ok" });
});
