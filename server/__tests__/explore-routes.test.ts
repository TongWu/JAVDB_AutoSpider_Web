import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { app } from "../app";

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

async function seedTables(opsDb: D1Database, histDb: D1Database) {
  await opsDb
    .prepare(
      "CREATE TABLE IF NOT EXISTS system_state (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now')))",
    )
    .run();
  await opsDb
    .prepare(
      "CREATE TABLE IF NOT EXISTS api_config (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now')))",
    )
    .run();
  await histDb
    .prepare(
      "CREATE TABLE IF NOT EXISTS MovieHistory (Id INTEGER PRIMARY KEY AUTOINCREMENT, Href TEXT UNIQUE NOT NULL, VideoCode TEXT, Phase INTEGER, LastVisited TEXT, TorrentTypes TEXT)",
    )
    .run();
}

describe("Explore routes", () => {
  beforeAll(async () => {
    await seedTables(env.OPERATIONS_DB, env.HISTORY_DB);
  });

  it("POST /api/explore/sync-cookie updates cookie in config store", async () => {
    const { token, csrfToken, csrfCookie } = await getCsrf();
    const res = await app.request(
      "/api/explore/sync-cookie",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
          Cookie: csrfCookie,
        },
        body: JSON.stringify({ cookie: "test_cookie_value_123" }),
      },
      env,
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.status).toBe("ok");
  });

  it("POST /api/explore/resolve rejects invalid URL", async () => {
    const { token, csrfToken, csrfCookie } = await getCsrf();
    const res = await app.request(
      "/api/explore/resolve",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
          Cookie: csrfCookie,
        },
        body: JSON.stringify({ url: "https://evil.com/foo" }),
      },
      env,
    );
    expect(res.status).toBe(422);
  });

  it("POST /api/explore/download-magnet rejects invalid magnet", async () => {
    const { token, csrfToken, csrfCookie } = await getCsrf();
    const res = await app.request(
      "/api/explore/download-magnet",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
          Cookie: csrfCookie,
        },
        body: JSON.stringify({ magnet: "not-a-magnet" }),
      },
      env,
    );
    expect(res.status).toBe(422);
  });

  it("POST /api/explore/download-magnet returns unavailable for valid magnet (no qB in Workers)", async () => {
    const { token, csrfToken, csrfCookie } = await getCsrf();
    const res = await app.request(
      "/api/explore/download-magnet",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
          Cookie: csrfCookie,
        },
        body: JSON.stringify({ magnet: "magnet:?xt=urn:btih:abc123" }),
      },
      env,
    );
    expect([200, 501, 502].includes(res.status)).toBe(true);
  });

  it("POST /api/explore/index-status returns empty items for empty input", async () => {
    const { token, csrfToken, csrfCookie } = await getCsrf();
    const res = await app.request(
      "/api/explore/index-status",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
          Cookie: csrfCookie,
        },
        body: JSON.stringify({ movies: [] }),
      },
      env,
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.items).toBeDefined();
  });
});
