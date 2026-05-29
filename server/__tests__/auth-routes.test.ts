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

describe("Token revocation", () => {
  it("rejects revoked token on mutation requests", async () => {
    const { accessToken, csrfToken } = await login();
    // Logout to revoke the token
    await app.request("/api/auth/logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    }, env);
    // Try a POST with the revoked token
    const res = await app.request("/api/crawl/index", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken,
        Cookie: `csrf_token=${csrfToken}`,
      },
      body: JSON.stringify({}),
    }, env);
    expect(res.status).toBe(401);
  });

  it("allows revoked token on GET requests", async () => {
    const { accessToken } = await login();
    await app.request("/api/auth/logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    }, env);
    const res = await app.request("/api/capabilities", {
      headers: { Authorization: `Bearer ${accessToken}` },
    }, env);
    expect(res.status).toBe(200);
  });
});

describe("CORS", () => {
  it("rejects unknown origin in test mode (acts as non-production)", async () => {
    const res = await app.request("/api/health", {
      headers: { Origin: "https://evil.example.com" },
    }, env);
    // In test/dev mode, only localhost origins are allowed
    const allowOrigin = res.headers.get("Access-Control-Allow-Origin");
    expect(allowOrigin).not.toBe("https://evil.example.com");

    // Allowed localhost origin in test/dev mode should be echoed back
    const localRes = await app.request("/api/health", {
      headers: { Origin: "http://localhost:5173" },
    }, env);
    expect(localRes.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
  });
});
