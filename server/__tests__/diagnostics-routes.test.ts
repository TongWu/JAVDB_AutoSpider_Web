import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { app } from "../app";

async function getToken(): Promise<string> {
  const res = await app.request(
    "/api/auth/login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "testpassword123" }),
    },
    env,
  );
  const data = (await res.json()) as any;
  return data.access_token;
}

async function getCsrf(): Promise<{ token: string; csrfToken: string; csrfCookie: string }> {
  const res = await app.request(
    "/api/auth/login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "testpassword123" }),
    },
    env,
  );
  const data = (await res.json()) as any;
  return { token: data.access_token, csrfToken: data.csrf_token, csrfCookie: `csrf_token=${data.csrf_token}` };
}

async function seedTables(db: D1Database) {
  await db
    .prepare(
      "CREATE TABLE IF NOT EXISTS system_state (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now')))",
    )
    .run();
  await db
    .prepare(
      "CREATE TABLE IF NOT EXISTS api_config (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now')))",
    )
    .run();
}

describe("Diagnostics routes", () => {
  beforeAll(async () => {
    await seedTables(env.OPERATIONS_DB);
  });

  it("GET /api/diag/javdb-session returns session status (no cookie)", async () => {
    await env.OPERATIONS_DB.prepare("DELETE FROM api_config WHERE key = 'JAVDB_SESSION_COOKIE'").run();
    const token = await getToken();
    const res = await app.request("/api/diag/javdb-session", { headers: { Authorization: `Bearer ${token}` } }, env);
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.cookie_present).toBe(false);
    expect(data.cookie_value_preview).toBeNull();
    expect(data.is_likely_valid).toBe(false);
  });

  it("GET /api/diag/javdb-session returns status with cookie", async () => {
    await env.OPERATIONS_DB.prepare("INSERT OR REPLACE INTO api_config (key, value) VALUES (?, ?)").bind("JAVDB_SESSION_COOKIE", '"abc12345xyz"').run();
    const now = new Date().toISOString();
    await env.OPERATIONS_DB
      .prepare("INSERT OR REPLACE INTO system_state (key, value, updated_at) VALUES (?, ?, datetime('now'))")
      .bind("last_javdb_refresh", now)
      .run();

    const token = await getToken();
    const res = await app.request("/api/diag/javdb-session", { headers: { Authorization: `Bearer ${token}` } }, env);
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.cookie_present).toBe(true);
    expect(data.cookie_value_preview).toBe("abc12345...");
    expect(data.is_likely_valid).toBe(true);
  });

  it("POST /api/diag/javdb-session/refresh with cookie_paste", async () => {
    const { token, csrfToken, csrfCookie } = await getCsrf();
    const res = await app.request(
      "/api/diag/javdb-session/refresh",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
          Cookie: csrfCookie,
        },
        body: JSON.stringify({ method: "cookie_paste", cookie_value: "new_cookie_value_here" }),
      },
      env,
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.success).toBe(true);
    expect(data.method).toBe("cookie_paste");
    expect(data.new_cookie_preview).toBe("new_cook...");
  });

  it("POST /api/diag/javdb-session/refresh with headless returns unavailable", async () => {
    const { token, csrfToken, csrfCookie } = await getCsrf();
    const res = await app.request(
      "/api/diag/javdb-session/refresh",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
          Cookie: csrfCookie,
        },
        body: JSON.stringify({ method: "headless" }),
      },
      env,
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.success).toBe(false);
    expect(data.error).toContain("unavailable");
  });
});
