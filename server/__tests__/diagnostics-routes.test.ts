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

async function seedOpsIncidentTables(db: D1Database) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS OpsIncidents (
      incident_id TEXT PRIMARY KEY,
      trigger_source TEXT NOT NULL,
      run_id TEXT,
      run_attempt INTEGER,
      session_id TEXT,
      incident_type TEXT NOT NULL,
      status TEXT NOT NULL,
      persistence_status TEXT NOT NULL,
      model_version TEXT NOT NULL,
      detector_version TEXT NOT NULL,
      bundle_schema_version TEXT NOT NULL,
      confidence TEXT NOT NULL,
      confirmed_findings_json TEXT NOT NULL,
      likely_causes_json TEXT NOT NULL,
      unknowns_json TEXT NOT NULL,
      recommended_next_actions_json TEXT NOT NULL,
      unsafe_actions_json TEXT NOT NULL,
      evidence_refs_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      resolved_at TEXT
    )
  `).run();
  await db.prepare("DELETE FROM OpsIncidents").run();
  await db.prepare(`
    INSERT INTO OpsIncidents (
      incident_id, trigger_source, run_id, run_attempt, session_id, incident_type, status,
      persistence_status, model_version, detector_version, bundle_schema_version, confidence,
      confirmed_findings_json, likely_causes_json, unknowns_json, recommended_next_actions_json,
      unsafe_actions_json, evidence_refs_json, created_at, updated_at, resolved_at
    )
    VALUES (
      'opsinc_test', 'workflow_failure', '100', 1, '20260527T000000.000000Z-0000-0000', 'failed_ingestion', 'open',
      'd1_written', 'fallback-v1', 'detectors-v1', 'bundle-v1', 'low',
      '["Workflow result is failure."]', '[]', '[]', '["Inspect logs."]',
      '[]', '[]', '2026-05-27T00:00:00Z', '2026-05-27T00:00:00Z', NULL
    )
  `).run();
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

  it("GET /api/diag/ops-incidents returns persisted incidents", async () => {
    await seedOpsIncidentTables(env.REPORTS_DB);
    const token = await getToken();

    const res = await app.request("/api/diag/ops-incidents", {
      headers: { Authorization: `Bearer ${token}` },
    }, env);

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.items[0].incident_id).toBe("opsinc_test");
    expect(data.items[0].confirmed_findings).toEqual(["Workflow result is failure."]);
  });

  it("GET /api/diag/ops-incidents rejects non-positive limit with 400", async () => {
    await seedOpsIncidentTables(env.REPORTS_DB);
    const token = await getToken();

    const res = await app.request("/api/diag/ops-incidents?limit=0", {
      headers: { Authorization: `Bearer ${token}` },
    }, env);

    expect(res.status).toBe(400);
  });

  it("GET /api/diag/ops-incidents/analytics returns counts", async () => {
    await seedOpsIncidentTables(env.REPORTS_DB);
    const token = await getToken();

    const res = await app.request("/api/diag/ops-incidents/analytics", {
      headers: { Authorization: `Bearer ${token}` },
    }, env);

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.total).toBe(1);
    expect(data.by_type.failed_ingestion).toBe(1);
  });

  it("GET /api/diag/ops-incidents/:incident_id returns the mapped incident", async () => {
    await seedOpsIncidentTables(env.REPORTS_DB);
    const token = await getToken();

    const res = await app.request("/api/diag/ops-incidents/opsinc_test", {
      headers: { Authorization: `Bearer ${token}` },
    }, env);

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.incident_id).toBe("opsinc_test");
    expect(data.confirmed_findings).toEqual(["Workflow result is failure."]);
    expect(data.recommended_next_actions).toEqual(["Inspect logs."]);
  });

  it("GET /api/diag/ops-incidents/:incident_id returns 404 for unknown id", async () => {
    await seedOpsIncidentTables(env.REPORTS_DB);
    const token = await getToken();

    const res = await app.request("/api/diag/ops-incidents/opsinc_missing", {
      headers: { Authorization: `Bearer ${token}` },
    }, env);

    expect(res.status).toBe(404);
  });
});
