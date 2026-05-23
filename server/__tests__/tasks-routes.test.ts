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

async function seedJobRunsTable(db: D1Database) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS job_runs (
        job_id       TEXT PRIMARY KEY,
        workflow     TEXT NOT NULL,
        gh_run_id    INTEGER,
        status       TEXT NOT NULL DEFAULT 'dispatched',
        inputs       TEXT,
        created_at   TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    )
    .run();

  await db
    .prepare(
      `INSERT INTO job_runs (job_id, workflow, status, inputs)
       VALUES ('daily-20260524-100000-abcd', 'DailyIngestion.yml', 'completed', '{"dry_run":"false"}')`,
    )
    .run();

  await db
    .prepare(
      `INSERT INTO job_runs (job_id, workflow, status, gh_run_id, inputs)
       VALUES ('adhoc-20260524-110000-ef01', 'AdHocIngestion.yml', 'in_progress', 99999, '{"url":"https://javdb.com/actors/test"}')`,
    )
    .run();
}

describe("Tasks routes", () => {
  beforeAll(async () => {
    await seedJobRunsTable(env.OPERATIONS_DB);
  });

  it("GET /api/tasks lists jobs", async () => {
    const token = await getToken();
    const res = await app.request(
      "/api/tasks",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.items).toBeInstanceOf(Array);
    expect(data.items.length).toBeGreaterThanOrEqual(2);
  });

  it("GET /api/tasks/stats returns stats", async () => {
    const token = await getToken();
    const res = await app.request(
      "/api/tasks/stats",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data).toHaveProperty("total");
    expect(data).toHaveProperty("completed");
  });

  it("GET /api/tasks/:job_id returns single job", async () => {
    const token = await getToken();
    const res = await app.request(
      "/api/tasks/daily-20260524-100000-abcd",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.job_id).toBe("daily-20260524-100000-abcd");
    expect(data.status).toBe("completed");
  });

  it("GET /api/tasks/:job_id returns 404 for unknown job", async () => {
    const token = await getToken();
    const res = await app.request(
      "/api/tasks/nonexistent-job-id",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(404);
    const data = (await res.json()) as any;
    expect(data.error.code).toBe("job.not_found");
  });

  it("POST /api/tasks/daily returns 503 when GH_ACTIONS_TOKEN not set", async () => {
    const { token, csrfToken, csrfCookie } = await getCsrf();
    const res = await app.request(
      "/api/tasks/daily",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
          Cookie: csrfCookie,
        },
        body: JSON.stringify({ dry_run: false }),
      },
      env,
    );
    expect(res.status).toBe(503);
  });

  it("POST /api/tasks/adhoc returns 503 when GH_ACTIONS_TOKEN not set", async () => {
    const { token, csrfToken, csrfCookie } = await getCsrf();
    const res = await app.request(
      "/api/tasks/adhoc",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
          Cookie: csrfCookie,
        },
        body: JSON.stringify({ url: "https://javdb.com/actors/test" }),
      },
      env,
    );
    expect(res.status).toBe(503);
  });

  it("GET /api/tasks/:job_id/logs returns null logs_url when no gh_run_id linked", async () => {
    const token = await getToken();
    const res = await app.request(
      "/api/tasks/daily-20260524-100000-abcd/logs",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.logs_url).toBeNull();
    expect(data.message).toBe("No GitHub run linked yet");
  });
});
