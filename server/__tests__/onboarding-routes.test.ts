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

describe("Onboarding routes", () => {
  beforeAll(async () => {
    await seedTables(env.OPERATIONS_DB);
  });

  it("GET /api/onboarding/status returns onboarding state", async () => {
    const token = await getToken();
    const res = await app.request("/api/onboarding/status", { headers: { Authorization: `Bearer ${token}` } }, env);
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.completed).toBe(false);
    expect(data.required_missing).toContain("javdb_session");
    expect(data.required_missing).toContain("qb");
  });

  it("POST /api/onboarding/test returns test result", async () => {
    const { token, csrfToken, csrfCookie } = await getCsrf();
    const res = await app.request(
      "/api/onboarding/test",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
          Cookie: csrfCookie,
        },
        body: JSON.stringify({ component: "javdb" }),
      },
      env,
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.component).toBe("javdb");
    expect(typeof data.ok).toBe("boolean");
    expect(typeof data.message).toBe("string");
  });

  describe("POST /api/onboarding/test — GH Actions dispatch", () => {
    it("returns unavailable for qb when GH Actions not configured", async () => {
      const { token, csrfToken, csrfCookie } = await getCsrf();
      const res = await app.request(
        "/api/onboarding/test",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken,
            Cookie: csrfCookie,
          },
          body: JSON.stringify({ component: "qb" }),
        },
        env,
      );
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.component).toBe("qb");
      // Test env never configures GH Actions, so this is deterministically unavailable.
      expect(data.status).toBe("unavailable");
    });

    it("returns unavailable for smtp (no dedicated workflow)", async () => {
      const { token, csrfToken, csrfCookie } = await getCsrf();
      const res = await app.request(
        "/api/onboarding/test",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken,
            Cookie: csrfCookie,
          },
          body: JSON.stringify({ component: "smtp" }),
        },
        env,
      );
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.component).toBe("smtp");
      expect(data.status).toBe("unavailable");
    });

    it("javdb test still works synchronously", async () => {
      const { token, csrfToken, csrfCookie } = await getCsrf();
      const res = await app.request(
        "/api/onboarding/test",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken,
            Cookie: csrfCookie,
          },
          body: JSON.stringify({ component: "javdb" }),
        },
        env,
      );
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.component).toBe("javdb");
      expect(typeof data.ok).toBe("boolean");
    });
  });

  it("POST /api/onboarding/complete marks onboarding done", async () => {
    const { token, csrfToken, csrfCookie } = await getCsrf();
    const res = await app.request(
      "/api/onboarding/complete",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "X-CSRF-Token": csrfToken,
          Cookie: csrfCookie,
        },
      },
      env,
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.completed).toBe(true);
  });

  it("POST /api/onboarding/dismiss-hint stores dismissed hint", async () => {
    const { token, csrfToken, csrfCookie } = await getCsrf();
    const res = await app.request(
      "/api/onboarding/dismiss-hint",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
          Cookie: csrfCookie,
        },
        body: JSON.stringify({ hint_id: "welcome-banner" }),
      },
      env,
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.dismissed_hints).toContain("welcome-banner");
  });
});
