/**
 * API Contract Compliance Tests
 *
 * Verifies that the TS (Cloudflare Workers) backend response shapes match
 * the frontend's OpenAPI-generated types from `src/types/api.gen.ts`.
 *
 * This catches contract drift — where the TS backend returns fields the
 * frontend doesn't expect, or misses fields the frontend requires.
 *
 * We check structurally (field existence + type) rather than importing
 * the generated types directly, since they use complex intersection syntax.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { app } from "../app";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Assert that `obj` contains every key in `keys`. */
function assertHasKeys(
  obj: Record<string, unknown>,
  keys: string[],
  label: string,
) {
  for (const key of keys) {
    expect(obj, `${label} missing key: ${key}`).toHaveProperty(key);
  }
}

/** Assert the runtime type of a field matches the expected type string. */
function assertFieldType(
  obj: Record<string, unknown>,
  key: string,
  expectedType: string,
  label: string,
) {
  expect(
    typeof obj[key],
    `${label}.${key} should be ${expectedType}, got ${typeof obj[key]}`,
  ).toBe(expectedType);
}

/**
 * Assert that a field is either `null` or of the expected type.
 * Useful for optional-nullable fields like `completed_at?: string | null`.
 */
function assertNullableType(
  obj: Record<string, unknown>,
  key: string,
  expectedType: string,
  label: string,
) {
  const val = obj[key];
  expect(
    val === null || typeof val === expectedType,
    `${label}.${key} should be ${expectedType} | null, got ${typeof val} (${String(val)})`,
  ).toBe(true);
}

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

async function login(): Promise<string> {
  const res = await app.request(
    "/api/auth/login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "admin",
        password: "testpassword123",
      }),
    },
    env,
  );
  const data = (await res.json()) as Record<string, unknown>;
  return data.access_token as string;
}

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

async function seedAll() {
  // --- OPERATIONS_DB: job_runs ---
  await env.OPERATIONS_DB.prepare(
    `CREATE TABLE IF NOT EXISTS job_runs (
      job_id     TEXT PRIMARY KEY,
      workflow   TEXT NOT NULL,
      gh_run_id  INTEGER,
      status     TEXT NOT NULL DEFAULT 'dispatched',
      inputs     TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
  ).run();

  await env.OPERATIONS_DB.prepare(
    `INSERT OR IGNORE INTO job_runs (job_id, workflow, status, inputs, created_at)
     VALUES ('daily-20260101-120000-abcd', 'DailyIngestion.yml', 'completed',
             '{"url":"https://example.com"}', '2026-01-01 12:00:00')`,
  ).run();

  // --- REPORTS_DB: ReportSessions ---
  await env.REPORTS_DB.prepare(
    `CREATE TABLE IF NOT EXISTS ReportSessions (
      Id              TEXT PRIMARY KEY,
      Status          TEXT NOT NULL DEFAULT 'in_progress',
      WriteMode       TEXT DEFAULT 'pending',
      RunId           TEXT,
      RunAttempt      INTEGER,
      DateTimeCreated TEXT NOT NULL DEFAULT (datetime('now')),
      CommittedAt     TEXT,
      ReportType      TEXT NOT NULL DEFAULT 'daily',
      ReportDate      TEXT NOT NULL DEFAULT '2026-01-01',
      CsvFilename     TEXT NOT NULL DEFAULT 'report.csv',
      FailureReason   TEXT
    )`,
  ).run();

  await env.REPORTS_DB.prepare(
    `INSERT OR IGNORE INTO ReportSessions
       (Id, Status, WriteMode, RunId, RunAttempt, DateTimeCreated, CommittedAt, ReportType, ReportDate, CsvFilename)
     VALUES
       ('contract-sess-001', 'committed', 'pending', 'run-99', 1,
        '2026-01-01 10:00:00', '2026-01-01 10:05:00', 'daily', '2026-01-01', 'r.csv')`,
  ).run();

  await env.REPORTS_DB.prepare(
    `INSERT OR IGNORE INTO ReportSessions
       (Id, Status, WriteMode, RunId, RunAttempt, DateTimeCreated, ReportType, ReportDate, CsvFilename)
     VALUES
       ('contract-sess-002', 'failed', 'pending', 'run-100', 1,
        '2026-01-02 10:00:00', 'adhoc', '2026-01-02', 'r2.csv')`,
  ).run();

  // --- HISTORY_DB: MovieHistory + TorrentHistory ---
  await env.HISTORY_DB.prepare(
    `CREATE TABLE IF NOT EXISTS MovieHistory (
      Id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      VideoCode             TEXT NOT NULL,
      Href                  TEXT NOT NULL UNIQUE,
      ActorName             TEXT,
      ActorGender           TEXT,
      SupportingActors      TEXT,
      PerfectMatchIndicator INTEGER,
      HiResIndicator        INTEGER,
      DateTimeCreated       TEXT,
      DateTimeUpdated       TEXT,
      SessionId             TEXT
    )`,
  ).run();

  await env.HISTORY_DB.prepare(
    `INSERT OR IGNORE INTO MovieHistory (Id, VideoCode, Href, ActorName, DateTimeCreated)
     VALUES (1, 'CONTRACT-001', '/v/contract1', 'Test Actor', '2026-01-01 08:00:00')`,
  ).run();

  await env.HISTORY_DB.prepare(
    `CREATE TABLE IF NOT EXISTS TorrentHistory (
      Id                INTEGER PRIMARY KEY AUTOINCREMENT,
      MovieHistoryId    INTEGER NOT NULL,
      MagnetUri         TEXT,
      SubtitleIndicator INTEGER,
      CensorIndicator   INTEGER,
      ResolutionType    INTEGER,
      Size              TEXT,
      FileCount         INTEGER,
      DateTimeCreated   TEXT,
      SessionId         TEXT
    )`,
  ).run();

  await env.HISTORY_DB.prepare(
    `INSERT OR IGNORE INTO TorrentHistory (Id, MovieHistoryId, MagnetUri, DateTimeCreated)
     VALUES (1, 1, 'magnet:?xt=urn:btih:contracttest', '2026-01-01 08:00:00')`,
  ).run();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("API Contract Compliance", () => {
  beforeAll(async () => {
    await seedAll();
  });

  // -----------------------------------------------------------------------
  // POST /api/auth/login → LoginResponse
  // -----------------------------------------------------------------------
  describe("POST /api/auth/login → LoginResponse", () => {
    it("response has all required LoginResponse fields with correct types", async () => {
      const res = await app.request(
        "/api/auth/login",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: "admin",
            password: "testpassword123",
          }),
        },
        env,
      );
      expect(res.status).toBe(200);

      const data = (await res.json()) as Record<string, unknown>;
      const label = "LoginResponse";

      // Required fields per api.gen.ts:
      //   access_token: string, csrf_token: string, expires_in: number,
      //   refresh_token: string, role: string, token_type: string, username: string
      assertHasKeys(
        data,
        [
          "access_token",
          "csrf_token",
          "expires_in",
          "refresh_token",
          "role",
          "token_type",
          "username",
        ],
        label,
      );

      assertFieldType(data, "access_token", "string", label);
      assertFieldType(data, "csrf_token", "string", label);
      assertFieldType(data, "expires_in", "number", label);
      assertFieldType(data, "refresh_token", "string", label);
      assertFieldType(data, "role", "string", label);
      assertFieldType(data, "token_type", "string", label);
      assertFieldType(data, "username", "string", label);
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/capabilities → CapabilitiesResponse
  // -----------------------------------------------------------------------
  describe("GET /api/capabilities → CapabilitiesResponse", () => {
    it("response has all required CapabilitiesResponse fields with correct types", async () => {
      const token = await login();
      const res = await app.request(
        "/api/capabilities",
        { headers: authHeader(token) },
        env,
      );
      expect(res.status).toBe(200);

      const data = (await res.json()) as Record<string, unknown>;
      const label = "CapabilitiesResponse";

      // Top-level required fields
      assertHasKeys(
        data,
        [
          "version",
          "ingestion_mode",
          "gh_actions",
          "storage_backend",
          "features",
          "deployment",
          "build",
        ],
        label,
      );

      assertFieldType(data, "version", "string", label);
      assertFieldType(data, "ingestion_mode", "string", label);
      assertFieldType(data, "storage_backend", "string", label);
      assertFieldType(data, "deployment", "string", label);

      // Nested: build — required: backend_version (string), git_sha (string);
      //         optional: frontend_version (string | null)
      const build = data.build as Record<string, unknown>;
      assertHasKeys(build, ["backend_version", "git_sha"], `${label}.build`);
      assertFieldType(build, "backend_version", "string", `${label}.build`);
      assertFieldType(build, "git_sha", "string", `${label}.build`);
      // frontend_version is optional nullable
      if ("frontend_version" in build) {
        assertNullableType(
          build,
          "frontend_version",
          "string",
          `${label}.build`,
        );
      }

      // Nested: features — all boolean
      const features = data.features as Record<string, unknown>;
      // closed_loop is probe-based: false here since AcquisitionOutcome isn't seeded; only its type is asserted.
      const featureKeys = [
        "pikpak",
        "rclone",
        "smtp",
        "proxy_pool",
        "javdb_login",
        "proxy_preview",
        "closed_loop",
        "library_ownership",
        "library_consumption",
        "watch_intent",
        "magnet_aggregation",
        "site_drift_sentinel",
        "ops_alerting",
      ];
      assertHasKeys(features, featureKeys, `${label}.features`);
      for (const fk of featureKeys) {
        assertFieldType(features, fk, "boolean", `${label}.features`);
      }

      // Nested: gh_actions — tier (string enum), repo (string|null), token_configured (boolean)
      const ghActions = data.gh_actions as Record<string, unknown>;
      assertHasKeys(
        ghActions,
        ["tier", "repo", "token_configured"],
        `${label}.gh_actions`,
      );
      assertFieldType(ghActions, "tier", "string", `${label}.gh_actions`);
      assertNullableType(
        ghActions,
        "repo",
        "string",
        `${label}.gh_actions`,
      );
      assertFieldType(
        ghActions,
        "token_configured",
        "boolean",
        `${label}.gh_actions`,
      );
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/tasks → ListTasksResponse
  // -----------------------------------------------------------------------
  describe("GET /api/tasks → ListTasksResponse", () => {
    it("response has required ListTasksResponse fields and correct task shapes", async () => {
      const token = await login();
      const res = await app.request(
        "/api/tasks",
        { headers: authHeader(token) },
        env,
      );
      expect(res.status).toBe(200);

      const data = (await res.json()) as Record<string, unknown>;
      const label = "ListTasksResponse";

      // Top-level required fields
      assertHasKeys(data, ["tasks", "next_schedule"], label);
      expect(Array.isArray(data.tasks)).toBe(true);

      // next_schedule — NextScheduleInfo
      const ns = data.next_schedule as Record<string, unknown>;
      assertHasKeys(
        ns,
        ["cron_pipeline", "cron_spider", "source"],
        `${label}.next_schedule`,
      );
      assertFieldType(
        ns,
        "cron_pipeline",
        "string",
        `${label}.next_schedule`,
      );
      assertFieldType(ns, "cron_spider", "string", `${label}.next_schedule`);
      assertFieldType(ns, "source", "string", `${label}.next_schedule`);

      // Each task — JobSummaryResponse
      const tasks = data.tasks as Record<string, unknown>[];
      expect(tasks.length).toBeGreaterThanOrEqual(1);

      for (const task of tasks) {
        const tLabel = `${label}.tasks[]`;

        // Required fields
        assertHasKeys(task, ["job_id", "status"], tLabel);
        assertFieldType(task, "job_id", "string", tLabel);
        assertFieldType(task, "status", "string", tLabel);

        // Optional nullable fields — must exist in the response (our backend always sets them)
        assertHasKeys(
          task,
          [
            "command",
            "completed_at",
            "created_at",
            "kind",
            "log",
            "log_size",
            "mode",
            "source",
            "url",
          ],
          tLabel,
        );
        assertNullableType(task, "command", "object", tLabel); // string[] serialises as object
        assertNullableType(task, "completed_at", "string", tLabel);
        assertNullableType(task, "created_at", "string", tLabel);
        assertNullableType(task, "kind", "string", tLabel);
        assertNullableType(task, "log", "string", tLabel);
        assertNullableType(task, "log_size", "number", tLabel);
        assertNullableType(task, "mode", "string", tLabel);
        assertNullableType(task, "source", "string", tLabel);
        assertNullableType(task, "url", "string", tLabel);
      }
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/tasks/stats → TaskStatsResponse
  // -----------------------------------------------------------------------
  describe("GET /api/tasks/stats → TaskStatsResponse", () => {
    it("response has all required TaskStatsResponse fields with correct types", async () => {
      const token = await login();
      const res = await app.request(
        "/api/tasks/stats",
        { headers: authHeader(token) },
        env,
      );
      expect(res.status).toBe(200);

      const data = (await res.json()) as Record<string, unknown>;
      const label = "TaskStatsResponse";

      assertHasKeys(
        data,
        ["adhoc_running", "daily_failed", "daily_running", "daily_success"],
        label,
      );
      assertFieldType(data, "adhoc_running", "number", label);
      assertFieldType(data, "daily_failed", "number", label);
      assertFieldType(data, "daily_running", "number", label);
      assertFieldType(data, "daily_success", "number", label);
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/stats/summary → StatsSummary
  // -----------------------------------------------------------------------
  describe("GET /api/stats/summary → StatsSummary", () => {
    it("response has all required StatsSummary fields with correct types", async () => {
      const token = await login();
      const res = await app.request(
        "/api/stats/summary",
        { headers: authHeader(token) },
        env,
      );
      expect(res.status).toBe(200);

      const data = (await res.json()) as Record<string, unknown>;
      const label = "StatsSummary";

      // Required number fields
      const requiredNumeric = [
        "proxy_bans_last_7d",
        "total_dedup_freed_bytes",
        "total_movies",
        "total_pikpak",
        "total_runs",
        "total_torrents",
      ];
      assertHasKeys(data, requiredNumeric, label);
      for (const key of requiredNumeric) {
        assertFieldType(data, key, "number", label);
      }

      // Optional nullable number fields
      assertHasKeys(data, ["avg_duration_seconds", "success_rate"], label);
      assertNullableType(data, "avg_duration_seconds", "number", label);
      assertNullableType(data, "success_rate", "number", label);
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/stats/trend → TrendResponse
  // -----------------------------------------------------------------------
  describe("GET /api/stats/trend → TrendResponse", () => {
    it("response has all required TrendResponse fields with correct types", async () => {
      const token = await login();
      const res = await app.request(
        "/api/stats/trend?metric=runs&period=7d",
        { headers: authHeader(token) },
        env,
      );
      expect(res.status).toBe(200);

      const data = (await res.json()) as Record<string, unknown>;
      const label = "TrendResponse";

      assertHasKeys(data, ["metric", "period", "data_points"], label);
      assertFieldType(data, "metric", "string", label);
      assertFieldType(data, "period", "string", label);
      expect(Array.isArray(data.data_points)).toBe(true);

      // Each data point — TrendDataPoint { date: string; value: number }
      const points = data.data_points as Record<string, unknown>[];
      for (const dp of points) {
        assertHasKeys(dp, ["date", "value"], `${label}.data_points[]`);
        assertFieldType(dp, "date", "string", `${label}.data_points[]`);
        assertFieldType(dp, "value", "number", `${label}.data_points[]`);
      }
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/sessions → SessionListResponse
  // -----------------------------------------------------------------------
  describe("GET /api/sessions → SessionListResponse", () => {
    it("response has all required SessionListResponse fields with correct types", async () => {
      const token = await login();
      const res = await app.request(
        "/api/sessions",
        { headers: authHeader(token) },
        env,
      );
      expect(res.status).toBe(200);

      const data = (await res.json()) as Record<string, unknown>;
      const label = "SessionListResponse";

      // Required: items (array), next_cursor (string | null)
      assertHasKeys(data, ["items", "next_cursor"], label);
      expect(Array.isArray(data.items)).toBe(true);
      assertNullableType(data, "next_cursor", "string", label);

      // total_estimate is optional nullable — if present, check type
      if ("total_estimate" in data) {
        assertNullableType(data, "total_estimate", "number", label);
      }

      // Each item — SessionItem
      const items = data.items as Record<string, unknown>[];
      expect(items.length).toBeGreaterThanOrEqual(1);

      for (const item of items) {
        const iLabel = `${label}.items[]`;

        // Required fields per SessionItem
        assertHasKeys(
          item,
          [
            "session_id",
            "state",
            "write_mode",
            "run_id",
            "run_attempt",
            "created_at",
          ],
          iLabel,
        );
        assertFieldType(item, "session_id", "string", iLabel);
        assertFieldType(item, "state", "string", iLabel);
        assertFieldType(item, "write_mode", "string", iLabel);
        assertNullableType(item, "run_id", "string", iLabel);
        assertNullableType(item, "run_attempt", "number", iLabel);
        assertFieldType(item, "created_at", "string", iLabel);
      }
    });
  });
});
