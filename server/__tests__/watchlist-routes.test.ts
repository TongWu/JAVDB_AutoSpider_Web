import { describe, it, expect, beforeAll } from "vitest";
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

async function seedWatchIntent() {
  await env.HISTORY_DB.prepare(
    `CREATE TABLE IF NOT EXISTS WatchIntent (
      video_code TEXT PRIMARY KEY, href TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('want','viewed')),
      notes TEXT, status_at TEXT,
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    )`,
  ).run();
}

describe("Watchlist routes", () => {
  beforeAll(async () => {
    await seedWatchIntent();
  });

  it("PUT upserts, GET reads, list filters, DELETE untracks", async () => {
    const { accessToken, csrfToken } = await login();

    const put = await app.request(
      "/api/watchlist/ABC-001",
      {
        method: "PUT",
        headers: mutationHeaders(accessToken, csrfToken),
        body: JSON.stringify({ href: "/v/abc001", status: "want" }),
      },
      env,
    );
    expect(put.status).toBe(200);
    expect((await put.json() as Record<string, unknown>).status).toBe("want");

    const got = await app.request(
      "/api/watchlist/ABC-001",
      { headers: authHeaders(accessToken) },
      env,
    );
    expect(got.status).toBe(200);
    expect((await got.json() as Record<string, unknown>).video_code).toBe("ABC-001");

    const list = await app.request(
      "/api/watchlist?status=want",
      { headers: authHeaders(accessToken) },
      env,
    );
    expect(list.status).toBe(200);
    const listBody = (await list.json()) as { items: unknown[]; total: number };
    expect(listBody.total).toBe(1);

    const del = await app.request(
      "/api/watchlist/ABC-001",
      { method: "DELETE", headers: mutationHeaders(accessToken, csrfToken) },
      env,
    );
    expect(del.status).toBe(200);
    expect((await del.json() as Record<string, unknown>).deleted).toBe(true);
  });

  it("rejects an invalid status with 422", async () => {
    const { accessToken, csrfToken } = await login();
    const res = await app.request(
      "/api/watchlist/X-1",
      {
        method: "PUT",
        headers: mutationHeaders(accessToken, csrfToken),
        body: JSON.stringify({ href: "/v/x1", status: "nope" }),
      },
      env,
    );
    expect(res.status).toBe(422);
  });

  it("preserves existing notes when a status-only update omits notes", async () => {
    const { accessToken, csrfToken } = await login();
    await app.request(
      "/api/watchlist/NOTE-1",
      {
        method: "PUT",
        headers: mutationHeaders(accessToken, csrfToken),
        body: JSON.stringify({ href: "/v/note1", status: "want", notes: "keep me" }),
      },
      env,
    );
    const put = await app.request(
      "/api/watchlist/NOTE-1",
      {
        method: "PUT",
        headers: mutationHeaders(accessToken, csrfToken),
        body: JSON.stringify({ href: "/v/note1", status: "viewed" }),
      },
      env,
    );
    expect(put.status).toBe(200);
    const body = (await put.json()) as Record<string, unknown>;
    expect(body.status).toBe("viewed");
    expect(body.notes).toBe("keep me");
  });
});
