import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { app } from "../app";
import { ensureReportSessionsCommittedAtColumn } from "../routes/sessions";

async function getCsrf() {
  const res = await app.request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "testpassword123" }),
  }, env);
  const data = (await res.json()) as any;
  return { token: data.access_token, csrfToken: data.csrf_token, csrfCookie: `csrf_token=${data.csrf_token}` };
}

describe("ensureReportSessionsCommittedAtColumn", () => {
  it("accepts duplicate ALTER errors when a concurrent migration added the column", async () => {
    let pragmaCalls = 0;
    let alterCalls = 0;

    const db = {
      prepare(sql: string) {
        if (sql === "PRAGMA table_info(ReportSessions)") {
          return {
            all: async () => {
              pragmaCalls += 1;
              return {
                results: pragmaCalls === 1
                  ? [{ name: "Id" }]
                  : [{ name: "Id" }, { name: "CommittedAt" }],
              };
            },
          };
        }

        if (sql === "ALTER TABLE ReportSessions ADD COLUMN CommittedAt TEXT") {
          return {
            run: async () => {
              alterCalls += 1;
              throw new Error("duplicate column name: CommittedAt");
            },
          };
        }

        throw new Error(`Unexpected SQL: ${sql}`);
      },
    } as unknown as D1Database;

    await expect(ensureReportSessionsCommittedAtColumn(db)).resolves.toBeUndefined();
    expect(pragmaCalls).toBe(2);
    expect(alterCalls).toBe(1);
  });
});

describe("POST /api/sessions/:id/commit legacy schema compatibility", () => {
  beforeAll(async () => {
    await env.REPORTS_DB.prepare("DROP TABLE IF EXISTS ReportSessions").run();
    await env.REPORTS_DB.prepare(
      `CREATE TABLE ReportSessions (
        Id TEXT PRIMARY KEY,
        ReportType TEXT NOT NULL,
        ReportDate TEXT NOT NULL,
        UrlType TEXT,
        DisplayName TEXT,
        Url TEXT,
        StartPage INTEGER,
        EndPage INTEGER,
        CsvFilename TEXT NOT NULL,
        DateTimeCreated TEXT NOT NULL,
        Status TEXT DEFAULT 'in_progress',
        RunId TEXT,
        RunAttempt INTEGER,
        FailureReason TEXT,
        WriteMode TEXT DEFAULT 'pending'
      )`,
    ).run();
    await env.REPORTS_DB.prepare(
      `INSERT INTO ReportSessions
       (Id, ReportType, ReportDate, CsvFilename, DateTimeCreated, Status, WriteMode)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind("legacy-commit", "daily", "2026-06-04", "legacy.csv", "2026-06-04 10:00:00", "in_progress", "pending")
      .run();
  });

  it("adds CommittedAt before updating the session", async () => {
    const { token, csrfToken, csrfCookie } = await getCsrf();
    const res = await app.request("/api/sessions/legacy-commit/commit", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken,
        Cookie: csrfCookie,
      },
      body: JSON.stringify({}),
    }, env);

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.new_state).toBe("committed");

    const columns = await env.REPORTS_DB
      .prepare("PRAGMA table_info(ReportSessions)")
      .all<{ name: string }>();
    expect(columns.results.some((column) => column.name === "CommittedAt")).toBe(true);

    const row = await env.REPORTS_DB.prepare(
      "SELECT Status, CommittedAt FROM ReportSessions WHERE Id = ?",
    ).bind("legacy-commit").first<{ Status: string; CommittedAt: string | null }>();
    expect(row?.Status).toBe("committed");
    expect(row?.CommittedAt).toEqual(expect.any(String));
  });
});
