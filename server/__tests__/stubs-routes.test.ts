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

async function getCsrf(): Promise<{
  token: string;
  csrfToken: string;
  csrfCookie: string;
}> {
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
  return {
    token: data.access_token,
    csrfToken: data.csrf_token,
    csrfCookie: `csrf_token=${data.csrf_token}`,
  };
}

describe("Stub routes — Python-only endpoints return 501", () => {
  // -----------------------------------------------------------------------
  // POST endpoints (require CSRF)
  // -----------------------------------------------------------------------

  it("POST /api/crawl/index returns 501", async () => {
    const { token, csrfToken, csrfCookie } = await getCsrf();
    const res = await app.request(
      "/api/crawl/index",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
          Cookie: csrfCookie,
        },
        body: JSON.stringify({}),
      },
      env,
    );
    expect(res.status).toBe(501);
    const data = (await res.json()) as any;
    expect(data.error.code).toBe("not_available");
    expect(data.error.message).toContain("Crawl index");
  });

  it("POST /api/parse/url returns 501", async () => {
    const { token, csrfToken, csrfCookie } = await getCsrf();
    const res = await app.request(
      "/api/parse/url",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
          Cookie: csrfCookie,
        },
        body: JSON.stringify({}),
      },
      env,
    );
    expect(res.status).toBe(501);
    const data = (await res.json()) as any;
    expect(data.error.code).toBe("not_available");
    expect(data.error.message).toContain("Parse URL");
  });

  it("POST /api/jobs/spider returns 501", async () => {
    const { token, csrfToken, csrfCookie } = await getCsrf();
    const res = await app.request(
      "/api/jobs/spider",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
          Cookie: csrfCookie,
        },
        body: JSON.stringify({}),
      },
      env,
    );
    expect(res.status).toBe(501);
    const data = (await res.json()) as any;
    expect(data.error.code).toBe("not_available");
    expect(data.error.message).toContain("Spider job");
  });

  it("POST /api/migrations/42/run returns 501", async () => {
    const { token, csrfToken, csrfCookie } = await getCsrf();
    const res = await app.request(
      "/api/migrations/42/run",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
          Cookie: csrfCookie,
        },
        body: JSON.stringify({}),
      },
      env,
    );
    expect(res.status).toBe(501);
    const data = (await res.json()) as any;
    expect(data.error.code).toBe("not_available");
    expect(data.error.message).toContain("Migration run");
  });

  // -----------------------------------------------------------------------
  // GET endpoints (no CSRF needed)
  // -----------------------------------------------------------------------

  it("GET /api/logs/search returns 501", async () => {
    const token = await getToken();
    const res = await app.request(
      "/api/logs/search",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(501);
    const data = (await res.json()) as any;
    expect(data.error.code).toBe("not_available");
    expect(data.error.message).toContain("Log search");
  });

  it("GET /api/jobs/abc123/status returns 501", async () => {
    const token = await getToken();
    const res = await app.request(
      "/api/jobs/abc123/status",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(501);
    const data = (await res.json()) as any;
    expect(data.error.code).toBe("not_available");
    expect(data.error.message).toContain("Job status");
  });

  // -----------------------------------------------------------------------
  // Auth guard — unauthenticated requests should be rejected before stubs
  // -----------------------------------------------------------------------

  it("rejects unauthenticated POST /api/crawl/index with 401", async () => {
    const res = await app.request(
      "/api/crawl/index",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
      env,
    );
    expect(res.status).toBe(401);
  });

  it("rejects unauthenticated GET /api/logs/search with 401", async () => {
    const res = await app.request("/api/logs/search", {}, env);
    expect(res.status).toBe(401);
  });
});
