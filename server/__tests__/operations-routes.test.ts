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

describe("Operations routes", () => {
  // -----------------------------------------------------------------------
  // Auth guard
  // -----------------------------------------------------------------------

  it("rejects unauthenticated requests with 401", async () => {
    const res = await app.request("/api/ops/qb/torrents", {}, env);
    expect(res.status).toBe(401);
  });

  // -----------------------------------------------------------------------
  // 501 stubs
  // -----------------------------------------------------------------------

  it("GET /api/ops/qb/torrents returns 501 not_available", async () => {
    const token = await getToken();
    const res = await app.request(
      "/api/ops/qb/torrents",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(501);
    const data = (await res.json()) as any;
    expect(data.error.code).toBe("not_available");
    expect(data.error.message).toContain("qBittorrent torrent list");
  });

  it("GET /api/ops/pikpak/queue returns 501 not_available", async () => {
    const token = await getToken();
    const res = await app.request(
      "/api/ops/pikpak/queue",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(501);
    const data = (await res.json()) as any;
    expect(data.error.code).toBe("not_available");
  });

  it("POST /api/ops/email/test returns 501 not_available", async () => {
    const { token, csrfToken, csrfCookie } = await getCsrf();
    const res = await app.request(
      "/api/ops/email/test",
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
  });

  it("GET /api/ops/email/history returns 501 not_available", async () => {
    const token = await getToken();
    const res = await app.request(
      "/api/ops/email/history",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(501);
    const data = (await res.json()) as any;
    expect(data.error.code).toBe("not_available");
  });

  it("POST /api/ops/cleanup/claim-stages returns 501 not_available", async () => {
    const { token, csrfToken, csrfCookie } = await getCsrf();
    const res = await app.request(
      "/api/ops/cleanup/claim-stages",
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
  });

  // -----------------------------------------------------------------------
  // 503 dispatch — GH_ACTIONS_TOKEN not configured in test env
  // -----------------------------------------------------------------------

  it("POST /api/ops/qb/filter-small returns 503 without GH_ACTIONS_TOKEN", async () => {
    const { token, csrfToken, csrfCookie } = await getCsrf();
    const res = await app.request(
      "/api/ops/qb/filter-small",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
          Cookie: csrfCookie,
        },
        body: JSON.stringify({ dry_run: true }),
      },
      env,
    );
    expect(res.status).toBe(503);
  });

  it("POST /api/ops/rclone/run returns 503 without GH_ACTIONS_TOKEN", async () => {
    const { token, csrfToken, csrfCookie } = await getCsrf();
    const res = await app.request(
      "/api/ops/rclone/run",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
          Cookie: csrfCookie,
        },
        body: JSON.stringify({ scan: true }),
      },
      env,
    );
    expect(res.status).toBe(503);
  });

  it("POST /api/ops/cleanup/stale-sessions returns 503 without GH_ACTIONS_TOKEN", async () => {
    const { token, csrfToken, csrfCookie } = await getCsrf();
    const res = await app.request(
      "/api/ops/cleanup/stale-sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
          Cookie: csrfCookie,
        },
        body: JSON.stringify({ apply: true }),
      },
      env,
    );
    expect(res.status).toBe(503);
  });

  // -----------------------------------------------------------------------
  // D1 query route
  // -----------------------------------------------------------------------

  it("GET /api/ops/rclone/last returns 200 with counts", async () => {
    const token = await getToken();
    const res = await app.request(
      "/api/ops/rclone/last",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data).toHaveProperty("inventory_count");
    expect(data).toHaveProperty("dedup_count");
    expect(data).toHaveProperty("last_dedup_at");
    // Tables don't exist in test DB, so expect 0/null
    expect(data.inventory_count).toBe(0);
    expect(data.dedup_count).toBe(0);
    expect(data.last_dedup_at).toBeNull();
  });
});
