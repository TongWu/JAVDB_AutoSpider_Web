import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { app } from "../app";

async function login() {
  const res = await app.request(
    "/api/auth/login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "testpassword123" }),
    },
    env,
  );
  const data = (await res.json()) as Record<string, unknown>;
  return {
    accessToken: data.access_token as string,
    csrfToken: data.csrf_token as string,
  };
}

function authHeaders(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` };
}

function mutationHeaders(accessToken: string, csrfToken: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
    "X-CSRF-Token": csrfToken,
    Cookie: `csrf_token=${csrfToken}`,
  };
}

// Seeds into REPORTS_DB — NOT HISTORY_DB. ContentFilterRule lives in javdb-reports.
async function seedContentFilterRule() {
  await env.REPORTS_DB.prepare(
    `CREATE TABLE IF NOT EXISTS ContentFilterRule (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      dimension  TEXT NOT NULL,
      mode       TEXT NOT NULL,
      value      TEXT,
      enabled    INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    )`,
  ).run();
}

describe("Content-filter routes", () => {
  beforeAll(async () => {
    await seedContentFilterRule();
  });

  beforeEach(async () => {
    await env.REPORTS_DB.prepare("DELETE FROM ContentFilterRule").run();
  });

  it("POST adds, GET lists, PUT toggles, DELETE removes", async () => {
    const { accessToken, csrfToken } = await login();

    const post = await app.request(
      "/api/content-filter",
      {
        method: "POST",
        headers: mutationHeaders(accessToken, csrfToken),
        body: JSON.stringify({ dimension: "tag", mode: "exclude", value: "censored" }),
      },
      env,
    );
    expect(post.status).toBe(201);
    const created = (await post.json()) as Record<string, unknown>;
    const ruleId = created.id as number;
    expect(created.enabled).toBe(true);

    const list = await app.request(
      "/api/content-filter",
      { headers: authHeaders(accessToken) },
      env,
    );
    expect(list.status).toBe(200);
    const listBody = (await list.json()) as { items: unknown[]; total: number };
    expect(listBody.total).toBe(1);

    const put = await app.request(
      `/api/content-filter/${ruleId}`,
      {
        method: "PUT",
        headers: mutationHeaders(accessToken, csrfToken),
        body: JSON.stringify({ enabled: false }),
      },
      env,
    );
    expect(put.status).toBe(200);
    expect((await put.json() as Record<string, unknown>).enabled).toBe(false);

    const del = await app.request(
      `/api/content-filter/${ruleId}`,
      { method: "DELETE", headers: mutationHeaders(accessToken, csrfToken) },
      env,
    );
    expect(del.status).toBe(200);
    expect((await del.json() as Record<string, unknown>).deleted).toBe(true);
  });

  it("rejects an invalid dimension/mode pair with 422", async () => {
    const { accessToken, csrfToken } = await login();
    const res = await app.request(
      "/api/content-filter",
      {
        method: "POST",
        headers: mutationHeaders(accessToken, csrfToken),
        body: JSON.stringify({ dimension: "actor", mode: "require_lead", value: "x" }),
      },
      env,
    );
    expect(res.status).toBe(422);
  });

  it("accepts regex + release_date rules, normalizes the date, and does not compile-check regex", async () => {
    const { accessToken, csrfToken } = await login();
    const regex = await app.request(
      "/api/content-filter",
      {
        method: "POST",
        headers: mutationHeaders(accessToken, csrfToken),
        body: JSON.stringify({ dimension: "tag", mode: "regex_exclude", value: "(?i)\\bvr\\b" }),
      },
      env,
    );
    expect(regex.status).toBe(201);
    // A malformed pattern is stored too — no JS-side compile check; the Python
    // ingestion engine fail-opens on it.
    const badRegex = await app.request(
      "/api/content-filter",
      {
        method: "POST",
        headers: mutationHeaders(accessToken, csrfToken),
        body: JSON.stringify({ dimension: "tag", mode: "regex_include", value: "(unclosed" }),
      },
      env,
    );
    expect(badRegex.status).toBe(201);
    const date = await app.request(
      "/api/content-filter",
      {
        method: "POST",
        headers: mutationHeaders(accessToken, csrfToken),
        body: JSON.stringify({ dimension: "release_date", mode: "before", value: "2020-01-01" }),
      },
      env,
    );
    expect(date.status).toBe(201);
    expect((await date.json() as Record<string, unknown>).value).toBe("2020-01-01");
  });

  it("rejects a non-ISO release_date with 422", async () => {
    const { accessToken, csrfToken } = await login();
    const res = await app.request(
      "/api/content-filter",
      {
        method: "POST",
        headers: mutationHeaders(accessToken, csrfToken),
        body: JSON.stringify({ dimension: "release_date", mode: "before", value: "2020/01/01" }),
      },
      env,
    );
    expect(res.status).toBe(422);
  });

  it("rejects a non-string value with 422 (not a 500), matching the Python schema", async () => {
    const { accessToken, csrfToken } = await login();
    const res = await app.request(
      "/api/content-filter",
      {
        method: "POST",
        headers: mutationHeaders(accessToken, csrfToken),
        body: JSON.stringify({ dimension: "tag", mode: "exclude", value: 123 }),
      },
      env,
    );
    expect(res.status).toBe(422);
  });

  it("rejects a null JSON body with 422 (not a 500) on POST and PUT", async () => {
    const { accessToken, csrfToken } = await login();
    const post = await app.request(
      "/api/content-filter",
      { method: "POST", headers: mutationHeaders(accessToken, csrfToken), body: "null" },
      env,
    );
    expect(post.status).toBe(422);
    const put = await app.request(
      "/api/content-filter/1",
      { method: "PUT", headers: mutationHeaders(accessToken, csrfToken), body: "null" },
      env,
    );
    expect(put.status).toBe(422);
  });

  it("rejects a non-integer rule id with 422 on PUT and DELETE", async () => {
    const { accessToken, csrfToken } = await login();
    const put = await app.request(
      "/api/content-filter/not-a-number",
      {
        method: "PUT",
        headers: mutationHeaders(accessToken, csrfToken),
        body: JSON.stringify({ enabled: true }),
      },
      env,
    );
    expect(put.status).toBe(422);
    const del = await app.request(
      "/api/content-filter/not-a-number",
      { method: "DELETE", headers: mutationHeaders(accessToken, csrfToken) },
      env,
    );
    expect(del.status).toBe(422);
  });
});
