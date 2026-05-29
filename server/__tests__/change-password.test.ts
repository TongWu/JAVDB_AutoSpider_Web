import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { app } from "../app";

async function ensureConfigTable(db: D1Database) {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS api_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
  ).run();
}

async function clearConfigTable(db: D1Database) {
  await db.prepare("DELETE FROM api_config").run();
}

async function login(username = "admin", password = "testpassword123") {
  const res = await app.request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  }, env);
  const data = await res.json() as any;
  return {
    accessToken: data.access_token as string,
    csrfToken: data.csrf_token as string,
  };
}

describe("POST /api/auth/change-password", () => {
  beforeEach(async () => {
    await ensureConfigTable(env.OPERATIONS_DB);
    await clearConfigTable(env.OPERATIONS_DB);
  });

  it("rejects unauthenticated requests", async () => {
    const res = await app.request("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ old_password: "x", new_password: "y" }),
    }, env);
    expect(res.status).toBe(401);
  });

  it("rejects wrong old password", async () => {
    const { accessToken, csrfToken } = await login();
    const res = await app.request("/api/auth/change-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        "X-CSRF-Token": csrfToken,
        Cookie: `csrf_token=${csrfToken}`,
      },
      body: JSON.stringify({
        old_password: "wrongpassword",
        new_password: "newpassword123",
      }),
    }, env);
    expect(res.status).toBe(401);
  });

  it("rejects new password shorter than 8 chars", async () => {
    const { accessToken, csrfToken } = await login();
    const res = await app.request("/api/auth/change-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        "X-CSRF-Token": csrfToken,
        Cookie: `csrf_token=${csrfToken}`,
      },
      body: JSON.stringify({
        old_password: "testpassword123",
        new_password: "short",
      }),
    }, env);
    expect(res.status).toBe(400);
  });

  it("changes password successfully and persists to D1", async () => {
    const { accessToken, csrfToken } = await login();
    const res = await app.request("/api/auth/change-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        "X-CSRF-Token": csrfToken,
        Cookie: `csrf_token=${csrfToken}`,
      },
      body: JSON.stringify({
        old_password: "testpassword123",
        new_password: "newpassword123",
      }),
    }, env);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.status).toBe("ok");

    // Verify D1 has the new hash
    const row = await env.OPERATIONS_DB.prepare(
      "SELECT value FROM api_config WHERE key = 'ADMIN_PASSWORD_HASH'",
    ).first<{ value: string }>();
    expect(row).toBeDefined();
    // The stored value should be a JSON-stringified bcrypt hash
    const hash = JSON.parse(row!.value);
    expect(hash).toMatch(/^\$2[aby]\$/);
  });
});
