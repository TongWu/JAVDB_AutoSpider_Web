import { describe, it, expect } from "vitest";
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

async function createAlertTables(): Promise<void> {
  await env.REPORTS_DB.prepare(`
    CREATE TABLE IF NOT EXISTS OpsAlertPolicy (
      policy_id TEXT PRIMARY KEY,
      incident_type TEXT NOT NULL UNIQUE,
      min_confidence TEXT NOT NULL,
      enabled INTEGER NOT NULL,
      channels_json TEXT NOT NULL,
      updated_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run();
  await env.REPORTS_DB.prepare(`
    CREATE TABLE IF NOT EXISTS OpsAlertEvent (
      alert_id TEXT PRIMARY KEY,
      incident_id TEXT NOT NULL,
      policy_id TEXT,
      status TEXT NOT NULL,
      reason TEXT,
      fired_at TEXT NOT NULL
    )
  `).run();
}

async function getOpsAlertingFeature(): Promise<unknown> {
  const token = await getToken();
  const res = await app.request(
    "/api/capabilities",
    { headers: { Authorization: `Bearer ${token}` } },
    env,
  );
  expect(res.status).toBe(200);
  const data = await res.json() as { features: Record<string, unknown> };
  return data.features.ops_alerting;
}

describe("capabilities ops_alerting", () => {
  it("is true only when both alert tables are queryable in REPORTS_DB", async () => {
    await createAlertTables();

    expect(await getOpsAlertingFeature()).toBe(true);

    await env.REPORTS_DB.prepare("DROP TABLE OpsAlertEvent").run();
    expect(await getOpsAlertingFeature()).toBe(false);
  });
});
