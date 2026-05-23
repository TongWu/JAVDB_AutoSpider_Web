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

  it("GET /api/tasks lists jobs with summary shape", async () => {
    const token = await getToken();
    const res = await app.request(
      "/api/tasks",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.tasks).toBeInstanceOf(Array);
    expect(data.tasks.length).toBeGreaterThanOrEqual(2);

    // Verify next_schedule shape
    expect(data.next_schedule).toEqual({
      cron_pipeline: "N/A",
      cron_spider: "N/A",
      source: "cloudflare",
    });

    // Verify summary shape of first task
    const daily = data.tasks.find((t: any) => t.job_id === "daily-20260524-100000-abcd");
    expect(daily).toBeDefined();
    expect(daily.kind).toBe("daily");
    expect(daily.mode).toBe("pipeline");
    expect(daily.source).toBe("gh_actions");
    expect(daily.command).toBeNull();
    expect(daily.log).toBeNull();
    expect(daily.log_size).toBeNull();
    // completed status → completed_at should be set
    expect(daily.completed_at).not.toBeNull();

    const adhoc = data.tasks.find((t: any) => t.job_id === "adhoc-20260524-110000-ef01");
    expect(adhoc).toBeDefined();
    expect(adhoc.kind).toBe("adhoc");
    expect(adhoc.mode).toBeNull();
    expect(adhoc.url).toBe("https://javdb.com/actors/test");
    // in_progress status → completed_at should be null
    expect(adhoc.completed_at).toBeNull();
  });

  it("GET /api/tasks/stats returns frontend-compatible stats", async () => {
    const token = await getToken();
    const res = await app.request(
      "/api/tasks/stats",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data).toHaveProperty("daily_success");
    expect(data).toHaveProperty("daily_failed");
    expect(data).toHaveProperty("daily_running");
    expect(data).toHaveProperty("adhoc_running");
    expect(typeof data.daily_success).toBe("number");
    expect(typeof data.daily_failed).toBe("number");
    expect(typeof data.daily_running).toBe("number");
    expect(typeof data.adhoc_running).toBe("number");
  });

  it("GET /api/tasks/:job_id returns summary shape", async () => {
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
    expect(data.kind).toBe("daily");
    expect(data.mode).toBe("pipeline");
    expect(data.source).toBe("gh_actions");
    expect(data.command).toBeNull();
    expect(data.log).toBeNull();
    expect(data.log_size).toBeNull();
    expect(data.completed_at).not.toBeNull();
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
