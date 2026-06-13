import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { app } from "../app";
import { PARSE_CONTRACT } from "../services/parse-field-health";

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

interface ParseFillSeed {
  page_type: string;
  field: string;
  fill_rate: number;
  sample_count: number;
  observed_at: string;
  committed?: number;
}

async function seedParseFieldFills(db: D1Database, rows: ParseFillSeed[]): Promise<void> {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ParseRunFieldFill (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page_type TEXT NOT NULL,
      field TEXT NOT NULL,
      fill_rate REAL NOT NULL,
      sample_count INTEGER NOT NULL,
      observed_at TEXT NOT NULL,
      committed INTEGER NOT NULL DEFAULT 0
    )
  `).run();
  await db.prepare("DELETE FROM ParseRunFieldFill").run();
  for (const r of rows) {
    await db
      .prepare(
        `INSERT INTO ParseRunFieldFill (page_type, field, fill_rate, sample_count, observed_at, committed)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(r.page_type, r.field, r.fill_rate, r.sample_count, r.observed_at, r.committed ?? 1)
      .run();
  }
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

  it("GET /api/diag/ops-incidents filters by run_id", async () => {
    await seedOpsIncidentTables(env.REPORTS_DB);
    // Insert a second incident with a different run_id
    await env.REPORTS_DB.prepare(`
      INSERT INTO OpsIncidents (
        incident_id, trigger_source, run_id, run_attempt, session_id, incident_type, status,
        persistence_status, model_version, detector_version, bundle_schema_version, confidence,
        confirmed_findings_json, likely_causes_json, unknowns_json, recommended_next_actions_json,
        unsafe_actions_json, evidence_refs_json, created_at, updated_at, resolved_at
      )
      VALUES (
        'opsinc_other_run', 'workflow_failure', '999', 1, '20260528T000000.000000Z-0001-0001', 'failed_ingestion', 'open',
        'd1_written', 'fallback-v1', 'detectors-v1', 'bundle-v1', 'low',
        '[]', '[]', '[]', '[]',
        '[]', '[]', '2026-05-28T00:00:00Z', '2026-05-28T00:00:00Z', NULL
      )
    `).run();

    const token = await getToken();

    // Query with run_id=100 — only opsinc_test should be returned
    const res = await app.request("/api/diag/ops-incidents?run_id=100", {
      headers: { Authorization: `Bearer ${token}` },
    }, env);

    expect(res.status).toBe(200);
    const data = await res.json() as { items: { incident_id: string }[] };
    expect(data.items).toHaveLength(1);
    expect(data.items[0].incident_id).toBe("opsinc_test");

    // Verify the other run's incident is excluded (not in this result)
    const otherIds = data.items.map((i) => i.incident_id);
    expect(otherIds).not.toContain("opsinc_other_run");
  });

  it("GET /api/diag/ops-incidents filters by incident_type", async () => {
    await seedOpsIncidentTables(env.REPORTS_DB);
    // Insert a second incident with a different incident_type
    await env.REPORTS_DB.prepare(`
      INSERT INTO OpsIncidents (
        incident_id, trigger_source, run_id, run_attempt, session_id, incident_type, status,
        persistence_status, model_version, detector_version, bundle_schema_version, confidence,
        confirmed_findings_json, likely_causes_json, unknowns_json, recommended_next_actions_json,
        unsafe_actions_json, evidence_refs_json, created_at, updated_at, resolved_at
      )
      VALUES (
        'opsinc_other_type', 'workflow_failure', '101', 1, '20260529T000000.000000Z-0002-0002', 'proxy_exhaustion', 'open',
        'd1_written', 'fallback-v1', 'detectors-v1', 'bundle-v1', 'low',
        '[]', '[]', '[]', '[]',
        '[]', '[]', '2026-05-29T00:00:00Z', '2026-05-29T00:00:00Z', NULL
      )
    `).run();

    const token = await getToken();

    const res = await app.request("/api/diag/ops-incidents?incident_type=failed_ingestion", {
      headers: { Authorization: `Bearer ${token}` },
    }, env);

    expect(res.status).toBe(200);
    const data = await res.json() as { items: { incident_id: string; incident_type: string }[] };
    expect(data.items).toHaveLength(1);
    expect(data.items[0].incident_id).toBe("opsinc_test");
    expect(data.items.every((i) => i.incident_type === "failed_ingestion")).toBe(true);
  });

  // -------------------------------------------------------------------------
  // GET /api/diag/parse-field-health (ADR-035 Phase 3 drift surface)
  // -------------------------------------------------------------------------
  // -------------------------------------------------------------------------
  // GET /api/diag/ops-incidents/:id/remediation-proposals  (ADR-026 P3)
  // POST /api/diag/remediation-proposals/:id/decision       (ADR-026 P3)
  // -------------------------------------------------------------------------
  async function seedRemediationProposalTable(db: D1Database) {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS OpsRemediationProposals (
        proposal_id TEXT PRIMARY KEY,
        incident_id TEXT NOT NULL,
        action_type TEXT NOT NULL,
        status TEXT NOT NULL,
        safety_level TEXT NOT NULL,
        title TEXT NOT NULL,
        rationale TEXT NOT NULL,
        command_preview TEXT,
        runbook_ref TEXT,
        evidence_refs_json TEXT NOT NULL,
        required_checks_json TEXT NOT NULL,
        blocked_reasons_json TEXT NOT NULL,
        proposed_by TEXT NOT NULL,
        decided_by TEXT,
        decision_note TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        decided_at TEXT
      )
    `).run();
    await db.prepare("DELETE FROM OpsRemediationProposals").run();
    await db.prepare(`
      INSERT INTO OpsRemediationProposals (
        proposal_id, incident_id, action_type, status, safety_level, title, rationale,
        command_preview, runbook_ref, evidence_refs_json, required_checks_json,
        blocked_reasons_json, proposed_by, decided_by, decision_note, created_at, updated_at, decided_at
      )
      VALUES (
        'opsprop_test', 'opsinc_test', 'open_runbook', 'proposed', 'safe_to_prepare',
        'Open runbook', 'Review runbook.', NULL, 'docs/handbook/en/ops/troubleshooting.md',
        '[]', '["Review confirmed findings."]', '[]', 'adr026-policy-v1',
        NULL, NULL, '2026-05-27T00:00:00Z', '2026-05-27T00:00:00Z', NULL
      )
    `).run();
  }

  it("GET /api/diag/ops-incidents/:id/remediation-proposals returns proposals", async () => {
    await seedRemediationProposalTable(env.REPORTS_DB);
    const token = await getToken();

    const res = await app.request("/api/diag/ops-incidents/opsinc_test/remediation-proposals", {
      headers: { Authorization: `Bearer ${token}` },
    }, env);

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.items).toHaveLength(1);
    expect(data.items[0].proposal_id).toBe("opsprop_test");
    expect(data.items[0].required_checks).toEqual(["Review confirmed findings."]);
    expect(data.items[0].evidence_refs).toEqual([]);
    expect(data.items[0].blocked_reasons).toEqual([]);
  });

  it("POST /api/diag/remediation-proposals/:id/decision records an admin decision", async () => {
    await seedRemediationProposalTable(env.REPORTS_DB);
    const { token, csrfToken, csrfCookie } = await getCsrf();

    const res = await app.request(
      "/api/diag/remediation-proposals/opsprop_test/decision",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
          Cookie: csrfCookie,
        },
        body: JSON.stringify({ status: "approved", decision_note: "Reviewed." }),
      },
      env,
    );

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.status).toBe("approved");
    expect(data.decided_by).toBe("admin");
    expect(data.decision_note).toBe("Reviewed.");
    expect(data.decided_at).not.toBeNull();
  });

  it("POST /api/diag/remediation-proposals/:id/decision rejects approving a blocked proposal (409)", async () => {
    await seedRemediationProposalTable(env.REPORTS_DB);
    // A safety-blocked proposal must never be approvable (parity with Python API).
    await env.REPORTS_DB.prepare(
      `INSERT INTO OpsRemediationProposals (
         proposal_id, incident_id, action_type, status, safety_level, title, rationale,
         command_preview, runbook_ref, evidence_refs_json, required_checks_json,
         blocked_reasons_json, proposed_by, decided_by, decision_note, created_at, updated_at, decided_at
       ) VALUES (
         'opsprop_blocked', 'opsinc_test', 'prepare_rollback_workflow', 'proposed', 'blocked',
         'Prepare rollback workflow', 'Rollback blocked.', NULL, 'docs/handbook/en/ops/d1-rollback.md',
         '[]', '[]', '["Session id is missing."]', 'adr026-policy-v1',
         NULL, NULL, '2026-05-27T00:00:00Z', '2026-05-27T00:00:00Z', NULL
       )`,
    ).run();
    const { token, csrfToken, csrfCookie } = await getCsrf();

    const res = await app.request(
      "/api/diag/remediation-proposals/opsprop_blocked/decision",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
          Cookie: csrfCookie,
        },
        body: JSON.stringify({ status: "approved" }),
      },
      env,
    );

    expect(res.status).toBe(409);
    const row = await env.REPORTS_DB
      .prepare("SELECT status FROM OpsRemediationProposals WHERE proposal_id = ?")
      .bind("opsprop_blocked")
      .first<{ status: string }>();
    expect(row?.status).toBe("proposed");
  });

  it("GET /api/diag/parse-field-health returns annotated health items (critical ok)", async () => {
    await seedParseFieldFills(env.REPORTS_DB, [
      { page_type: "index", field: "href", fill_rate: 1.0, sample_count: 100, observed_at: "2026-06-01T00:00:00Z" },
    ]);
    const token = await getToken();

    const res = await app.request("/api/diag/parse-field-health", {
      headers: { Authorization: `Bearer ${token}` },
    }, env);

    expect(res.status).toBe(200);
    const data = await res.json() as { items: Record<string, unknown>[] };
    const href = data.items.find((i) => i.page_type === "index" && i.field === "href")!;
    expect(href).toBeTruthy();
    // Full openapi item shape
    expect(Object.keys(href).sort()).toEqual(
      ["baseline", "field", "fill_rate", "observed_at", "page_type", "sample_count", "severity", "status", "threshold"],
    );
    expect(href.severity).toBe("critical");
    expect(href.status).toBe("ok");
    expect(href.fill_rate).toBe(1.0);
    expect(href.sample_count).toBe(100);
    expect(href.baseline).toBeNull();
    expect(href.threshold).toBe(PARSE_CONTRACT.index.href.min_fill);
  });

  it("GET /api/diag/parse-field-health picks newest COMMITTED fill per (page_type, field)", async () => {
    await seedParseFieldFills(env.REPORTS_DB, [
      { page_type: "index", field: "href", fill_rate: 0.2, sample_count: 100, observed_at: "2026-01-01T00:00:00Z", committed: 1 },
      { page_type: "index", field: "href", fill_rate: 1.0, sample_count: 100, observed_at: "2026-02-01T00:00:00Z", committed: 1 },
      // newer but UNcommitted — must be ignored
      { page_type: "index", field: "href", fill_rate: 0.0, sample_count: 100, observed_at: "2026-03-01T00:00:00Z", committed: 0 },
    ]);
    const token = await getToken();

    const res = await app.request("/api/diag/parse-field-health", {
      headers: { Authorization: `Bearer ${token}` },
    }, env);

    expect(res.status).toBe(200);
    const data = await res.json() as { items: { page_type: string; field: string; fill_rate: number; status: string }[] };
    const href = data.items.find((i) => i.field === "href")!;
    expect(href.fill_rate).toBe(1.0);
    expect(href.status).toBe("ok");
  });

  it("GET /api/diag/parse-field-health flags critical_drift below the floor", async () => {
    await seedParseFieldFills(env.REPORTS_DB, [
      { page_type: "index", field: "video_code", fill_rate: 0.1, sample_count: 100, observed_at: "2026-06-01T00:00:00Z" },
    ]);
    const token = await getToken();

    const res = await app.request("/api/diag/parse-field-health", {
      headers: { Authorization: `Bearer ${token}` },
    }, env);

    expect(res.status).toBe(200);
    const data = await res.json() as { items: { field: string; status: string }[] };
    const vc = data.items.find((i) => i.field === "video_code")!;
    expect(vc.status).toBe("critical_drift");
  });

  it("GET /api/diag/parse-field-health computes soft baselines (ok / soft_drift / no_baseline)", async () => {
    await seedParseFieldFills(env.REPORTS_DB, [
      // rate: history median 0.8 (threshold 0.4), latest 0.9 ⇒ ok
      { page_type: "index", field: "rate", fill_rate: 0.8, sample_count: 100, observed_at: "2026-01-01T00:00:00Z" },
      { page_type: "index", field: "rate", fill_rate: 0.8, sample_count: 100, observed_at: "2026-01-02T00:00:00Z" },
      { page_type: "index", field: "rate", fill_rate: 0.8, sample_count: 100, observed_at: "2026-01-03T00:00:00Z" },
      { page_type: "index", field: "rate", fill_rate: 0.9, sample_count: 100, observed_at: "2026-02-01T00:00:00Z" },
      // comment_count: history median 0.8 (threshold 0.4), latest 0.1 ⇒ soft_drift
      { page_type: "index", field: "comment_count", fill_rate: 0.8, sample_count: 100, observed_at: "2026-01-01T00:00:00Z" },
      { page_type: "index", field: "comment_count", fill_rate: 0.1, sample_count: 100, observed_at: "2026-02-01T00:00:00Z" },
      // release_date: single committed fill, no prior history ⇒ no_baseline
      { page_type: "index", field: "release_date", fill_rate: 0.5, sample_count: 100, observed_at: "2026-02-01T00:00:00Z" },
    ]);
    const token = await getToken();

    const res = await app.request("/api/diag/parse-field-health", {
      headers: { Authorization: `Bearer ${token}` },
    }, env);

    expect(res.status).toBe(200);
    const data = await res.json() as {
      items: { field: string; severity: string; baseline: number | null; threshold: number | null; status: string }[];
    };
    const rate = data.items.find((i) => i.field === "rate")!;
    expect(rate.severity).toBe("soft");
    expect(rate.baseline).toBe(0.8);
    expect(rate.threshold).toBeCloseTo(0.4, 10);
    expect(rate.status).toBe("ok");

    const comment = data.items.find((i) => i.field === "comment_count")!;
    expect(comment.baseline).toBe(0.8);
    expect(comment.status).toBe("soft_drift");

    const release = data.items.find((i) => i.field === "release_date")!;
    expect(release.baseline).toBeNull();
    expect(release.threshold).toBeNull();
    expect(release.status).toBe("no_baseline");
  });

  it("GET /api/diag/parse-field-health reports insufficient_sample below the sample floor", async () => {
    await seedParseFieldFills(env.REPORTS_DB, [
      { page_type: "index", field: "href", fill_rate: 1.0, sample_count: 5, observed_at: "2026-06-01T00:00:00Z" },
    ]);
    const token = await getToken();

    const res = await app.request("/api/diag/parse-field-health", {
      headers: { Authorization: `Bearer ${token}` },
    }, env);

    expect(res.status).toBe(200);
    const data = await res.json() as { items: { field: string; status: string }[] };
    const href = data.items.find((i) => i.field === "href")!;
    expect(href.status).toBe("insufficient_sample");
  });

  it("GET /api/diag/parse-field-health returns an empty surface when there are no committed fills", async () => {
    await seedParseFieldFills(env.REPORTS_DB, [
      { page_type: "index", field: "href", fill_rate: 1.0, sample_count: 100, observed_at: "2026-06-01T00:00:00Z", committed: 0 },
    ]);
    const token = await getToken();

    const res = await app.request("/api/diag/parse-field-health", {
      headers: { Authorization: `Bearer ${token}` },
    }, env);

    expect(res.status).toBe(200);
    const data = await res.json() as { items: unknown[] };
    expect(data.items).toEqual([]);
  });

  it("GET /api/diag/parse-field-health returns an empty surface when the fills table is absent", async () => {
    // Fresh deployment: the parse pipeline hasn't created ParseRunFieldFill yet.
    // Only the missing-table error is swallowed; other D1 errors must propagate.
    await env.REPORTS_DB.prepare("DROP TABLE IF EXISTS ParseRunFieldFill").run();
    const token = await getToken();

    const res = await app.request("/api/diag/parse-field-health", {
      headers: { Authorization: `Bearer ${token}` },
    }, env);

    expect(res.status).toBe(200);
    const data = await res.json() as { items: unknown[] };
    expect(data.items).toEqual([]);
  });
});
