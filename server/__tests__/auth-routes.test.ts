import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { app } from "../app";
import { verifyPassword } from "../routes/auth";

const LOGIN_BODY = JSON.stringify({
  username: "admin",
  password: "testpassword123",
});

async function login(): Promise<{ accessToken: string; csrfToken: string; cookies: string }> {
  const res = await app.request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: LOGIN_BODY,
  }, env);
  const data = await res.json() as any;
  const cookies = res.headers.get("set-cookie") ?? "";
  return { accessToken: data.access_token, csrfToken: data.csrf_token, cookies };
}

describe("POST /api/auth/login", () => {
  it("returns tokens on valid credentials", async () => {
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: LOGIN_BODY,
    }, env);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.access_token).toBeDefined();
    expect(data.refresh_token).toBeDefined();
    expect(data.token_type).toBe("bearer");
    expect(data.role).toBe("admin");
    expect(data.csrf_token).toBeDefined();
  });

  it("rejects invalid password", async () => {
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "wrong" }),
    }, env);
    expect(res.status).toBe(401);
  });
});

describe("POST /api/auth/refresh", () => {
  it("returns new access token from refresh token", async () => {
    const loginRes = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: LOGIN_BODY,
    }, env);
    const loginData = await loginRes.json() as any;

    const res = await app.request("/api/auth/refresh", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${loginData.refresh_token}`,
      },
    }, env);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.access_token).toBeDefined();
    expect(data.token_type).toBe("bearer");
  });
});

describe("GET /api/capabilities (auth guard)", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await app.request("/api/capabilities", {}, env);
    expect(res.status).toBe(401);
  });

  it("accepts authenticated requests", async () => {
    const { accessToken } = await login();
    const res = await app.request("/api/capabilities", {
      headers: { Authorization: `Bearer ${accessToken}` },
    }, env);
    expect(res.status).toBe(200);
  });
});

describe("Rate limiting", () => {
  it("returns 429 after exceeding login rate limit", async () => {
    for (let i = 0; i < 5; i++) {
      await app.request("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "wrong" }),
      }, env);
    }
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: LOGIN_BODY,
    }, env);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeDefined();
  });
});

describe("verifyPassword plain-text handling", () => {
  it("rejects plain: passwords when ENVIRONMENT=production", async () => {
    expect(await verifyPassword("testpassword123", "plain:testpassword123", "production")).toBe(false);
  });
  it("accepts correct plain: password in non-production", async () => {
    expect(await verifyPassword("testpassword123", "plain:testpassword123", "test")).toBe(true);
  });
  it("rejects incorrect plain: password in non-production", async () => {
    expect(await verifyPassword("wrong", "plain:testpassword123", "test")).toBe(false);
  });
});

describe("Session limit", () => {
  it("returns 429 session_limit after MAX_SESSIONS_PER_USER logins", async () => {
    for (let i = 0; i < 3; i++) {
      const ok = await app.request("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: LOGIN_BODY,
      }, env);
      expect(ok.status).toBe(200);
    }
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: LOGIN_BODY,
    }, env);
    expect(res.status).toBe(429);
    const data = await res.json() as any;
    expect(data.error.code).toBe("session_limit");
  });
});
