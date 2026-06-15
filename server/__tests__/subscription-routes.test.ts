import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { app } from "../app";

async function login(username = "admin", password = "testpassword123") {
  const res = await app.request(
    "/api/auth/login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
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

async function seedTables() {
  await env.HISTORY_DB.prepare(
    `CREATE TABLE IF NOT EXISTS ActorSubscription (
      actor_href TEXT PRIMARY KEY, actor_name TEXT,
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
      last_seen_href TEXT, last_checked_at TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    )`,
  ).run();
  await env.HISTORY_DB.prepare(
    `CREATE TABLE IF NOT EXISTS NewWorks (
      video_code TEXT PRIMARY KEY, href TEXT NOT NULL, actor_href TEXT NOT NULL,
      title TEXT, release_date TEXT,
      discovered_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      dismissed INTEGER NOT NULL DEFAULT 0 CHECK (dismissed IN (0,1))
    )`,
  ).run();
}

describe("Subscription routes", () => {
  beforeAll(async () => {
    await seedTables();
  });

  beforeEach(async () => {
    await env.HISTORY_DB.prepare("DELETE FROM ActorSubscription").run();
    await env.HISTORY_DB.prepare("DELETE FROM NewWorks").run();
    await env.HISTORY_DB.prepare(
      "INSERT INTO NewWorks (video_code, href, actor_href) VALUES (?, ?, ?)",
    )
      .bind("NW-001", "/v/nw001", "/actors/EvkJ")
      .run();
  });

  it("follows, lists, gets, and deletes a subscription", async () => {
    const { accessToken, csrfToken } = await login();

    const put = await app.request(
      "/api/subscriptions/actors/EvkJ",
      {
        method: "PUT",
        headers: mutationHeaders(accessToken, csrfToken),
        body: JSON.stringify({ actor_name: "Some Name", active: true }),
      },
      env,
    );
    expect(put.status).toBe(200);
    const putBody = (await put.json()) as Record<string, unknown>;
    expect(putBody.actor_href).toBe("/actors/EvkJ");
    expect(putBody.active).toBe(true);

    const list = await app.request(
      "/api/subscriptions?active_only=true",
      { headers: authHeaders(accessToken) },
      env,
    );
    expect(list.status).toBe(200);
    expect((await list.json() as { total: number }).total).toBe(1);

    const got = await app.request(
      "/api/subscriptions/actors/EvkJ",
      { headers: authHeaders(accessToken) },
      env,
    );
    expect(got.status).toBe(200);
    expect((await got.json() as Record<string, unknown>).actor_href).toBe("/actors/EvkJ");

    const del = await app.request(
      "/api/subscriptions/actors/EvkJ",
      { method: "DELETE", headers: mutationHeaders(accessToken, csrfToken) },
      env,
    );
    expect(del.status).toBe(200);
    expect((await del.json() as Record<string, unknown>).deleted).toBe(true);
  });

  it("new-works feed lists, dismisses, and excludes dismissed", async () => {
    const { accessToken, csrfToken } = await login();

    const feed = await app.request(
      "/api/new-works",
      { headers: authHeaders(accessToken) },
      env,
    );
    expect(feed.status).toBe(200);
    expect((await feed.json() as { total: number }).total).toBe(1);

    const dismiss = await app.request(
      "/api/new-works/NW-001/dismiss",
      { method: "POST", headers: mutationHeaders(accessToken, csrfToken) },
      env,
    );
    expect(dismiss.status).toBe(200);
    expect((await dismiss.json() as Record<string, unknown>).dismissed).toBe(true);

    const after = await app.request(
      "/api/new-works",
      { headers: authHeaders(accessToken) },
      env,
    );
    expect((await after.json() as { total: number }).total).toBe(0);
  });

  it("rejects malformed pagination with 422", async () => {
    const { accessToken } = await login();
    const badLimit = await app.request(
      "/api/subscriptions?limit=abc",
      { headers: authHeaders(accessToken) },
      env,
    );
    expect(badLimit.status).toBe(422);
    const badOffset = await app.request(
      "/api/new-works?offset=-1",
      { headers: authHeaders(accessToken) },
      env,
    );
    expect(badOffset.status).toBe(422);
  });

  it("rejects malformed actor hrefs with 422", async () => {
    const { accessToken, csrfToken } = await login();

    const res = await app.request(
      "/api/subscriptions/actors/EvkJ/extra",
      {
        method: "PUT",
        headers: mutationHeaders(accessToken, csrfToken),
        body: JSON.stringify({ actor_name: "Malformed" }),
      },
      env,
    );

    expect(res.status).toBe(422);
    expect((await res.json() as { error: { code: string } }).error.code).toBe("subscriptions.invalid_actor_href");
  });
});
