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

async function seedConfigTable(db: D1Database) {
  await db
    .prepare(
      "CREATE TABLE IF NOT EXISTS api_config (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now')))",
    )
    .run();
  await db.prepare("INSERT INTO api_config (key, value) VALUES (?, ?)").bind("QB_URL", '"https://192.168.1.1:8080"').run();
  await db.prepare("INSERT INTO api_config (key, value) VALUES (?, ?)").bind("START_PAGE", "1").run();
}

describe("Config routes", () => {
  beforeAll(async () => {
    await seedConfigTable(env.OPERATIONS_DB);
  });

  it("GET /api/config returns merged config with defaults", async () => {
    const token = await getToken();
    const res = await app.request("/api/config", { headers: { Authorization: `Bearer ${token}` } }, env);
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.QB_URL).toBe("https://192.168.1.1:8080");
    expect(data.START_PAGE).toBe(1);
  });

  it("GET /api/config masks sensitive values by default", async () => {
    const token = await getToken();
    await env.OPERATIONS_DB.prepare("INSERT OR REPLACE INTO api_config (key, value) VALUES (?, ?)").bind("QB_PASSWORD", '"secret123"').run();
    const res = await app.request("/api/config", { headers: { Authorization: `Bearer ${token}` } }, env);
    const data = (await res.json()) as any;
    expect(data.QB_PASSWORD).toBe("********");
  });

  it("GET /api/config?include_secrets=true returns unmasked for admin", async () => {
    const token = await getToken();
    const res = await app.request("/api/config?include_secrets=true", { headers: { Authorization: `Bearer ${token}` } }, env);
    const data = (await res.json()) as any;
    expect(data.QB_PASSWORD).toBe("secret123");
  });

  it("GET /api/config/meta returns field metadata", async () => {
    const token = await getToken();
    const res = await app.request("/api/config/meta", { headers: { Authorization: `Bearer ${token}` } }, env);
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.fields).toBeInstanceOf(Array);
    expect(data.fields.length).toBeGreaterThan(0);
    const qbUrl = data.fields.find((f: any) => f.key === "QB_URL");
    expect(qbUrl).toBeDefined();
    expect(qbUrl.section).toBe("qbittorrent");
    expect(qbUrl.sensitive).toBe(false);
  });

  it("PUT /api/config updates specific keys", async () => {
    const { token, csrfToken, csrfCookie } = await getCsrf();
    const res = await app.request(
      "/api/config",
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
          Cookie: csrfCookie,
        },
        body: JSON.stringify({ QB_URL: "https://10.0.0.1:8080" }),
      },
      env,
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.status).toBe("ok");

    const getRes = await app.request("/api/config", { headers: { Authorization: `Bearer ${token}` } }, env);
    const getData = (await getRes.json()) as any;
    expect(getData.QB_URL).toBe("https://10.0.0.1:8080");
  });
});
