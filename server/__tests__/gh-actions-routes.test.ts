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

describe("GH Actions routes", () => {
  it("GET /api/gh-actions/workflows returns 503 without token", async () => {
    const token = await getToken();
    const res = await app.request(
      "/api/gh-actions/workflows",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(503);
  });

  it("GET /api/gh-actions/runs returns 503 without token", async () => {
    const token = await getToken();
    const res = await app.request(
      "/api/gh-actions/runs",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(503);
  });

  it("POST /api/gh-actions/runs returns 503 without token", async () => {
    const { token, csrfToken, csrfCookie } = await getCsrf();
    const res = await app.request(
      "/api/gh-actions/runs",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
          Cookie: csrfCookie,
        },
        body: JSON.stringify({ workflow: "DailyIngestion.yml" }),
      },
      env,
    );
    expect(res.status).toBe(503);
  });

  it("GET /api/gh-actions/runs/:run_id/logs returns 503 without token", async () => {
    const token = await getToken();
    const res = await app.request(
      "/api/gh-actions/runs/12345/logs",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(503);
  });

  it("GET /api/gh-actions/workflows/:name returns 503 without token", async () => {
    const token = await getToken();
    const res = await app.request(
      "/api/gh-actions/workflows/DailyIngestion.yml",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(503);
  });

  it("PUT /api/gh-actions/workflows/:name returns 503 without token", async () => {
    const { token, csrfToken, csrfCookie } = await getCsrf();
    const res = await app.request(
      "/api/gh-actions/workflows/DailyIngestion.yml",
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
          Cookie: csrfCookie,
        },
        body: JSON.stringify({ content: "bmV3LWNvbnRlbnQ=", sha: "abc123", message: "test update" }),
      },
      env,
    );
    expect(res.status).toBe(503);
  });

  it("rejects unauthenticated requests with 401", async () => {
    const res = await app.request(
      "/api/gh-actions/workflows",
      {},
      env,
    );
    expect(res.status).toBe(401);
  });
});
