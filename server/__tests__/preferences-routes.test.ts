/**
 * Preferences routes tests (ADR-022 Phase 5).
 *
 * Pins the contract guarantees of the /api/preferences/* surface: rating
 * round-trip (with a slash-containing href encoded as one path segment),
 * validation error codes (tags / rating / content_type / weight), list
 * shapes, content-preference upsert, metadata 404, and auth enforcement.
 *
 * The three preference tables (MovieRatings, ContentPreferences,
 * MovieMetadata) are NOT created by table-init, so we create them here.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { app } from "../app";

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Table setup (preference tables are not created by table-init)
// ---------------------------------------------------------------------------

async function seedPreferenceTables() {
  await env.HISTORY_DB.prepare(
    `CREATE TABLE IF NOT EXISTS MovieRatings (
      href TEXT PRIMARY KEY, video_code TEXT NOT NULL,
      rating INTEGER CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
      tags TEXT NOT NULL DEFAULT '[]', notes TEXT, rated_at TEXT,
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    )`,
  ).run();

  await env.HISTORY_DB.prepare(
    `CREATE TABLE IF NOT EXISTS ContentPreferences (
      content_type TEXT NOT NULL CHECK (content_type IN ('actor','category','maker','director')),
      content_id TEXT NOT NULL, content_name TEXT NOT NULL,
      hearted INTEGER NOT NULL DEFAULT 0 CHECK (hearted IN (0,1)),
      weight REAL NOT NULL DEFAULT 1.0,
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      PRIMARY KEY (content_type, content_id)
    )`,
  ).run();

  await env.HISTORY_DB.prepare(
    `CREATE TABLE IF NOT EXISTS MovieMetadata (
      href TEXT PRIMARY KEY, title TEXT, video_code TEXT, release_date TEXT,
      duration_minutes INTEGER, rate REAL, comment_count INTEGER, review_count INTEGER,
      want_count INTEGER, watched_count INTEGER, maker TEXT, publisher TEXT, series TEXT,
      directors TEXT, categories TEXT, poster_url TEXT, fanart_urls TEXT, trailer_url TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    )`,
  ).run();

  // Seed one metadata row so a positive metadata GET could be asserted.
  await env.HISTORY_DB.prepare(
    `INSERT OR IGNORE INTO MovieMetadata (href, title, video_code)
     VALUES ('/v/meta-exists', 'Meta Title', 'v/meta-exists')`,
  ).run();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Preferences routes", () => {
  beforeAll(async () => {
    await seedPreferenceTables();
  });

  // -----------------------------------------------------------------------
  // 1. Rating round-trip with a slash-containing href as one segment.
  // -----------------------------------------------------------------------
  it("round-trips a rating for a slash-containing href encoded as one segment", async () => {
    const { accessToken, csrfToken } = await login();
    const href = "/v/test-roundtrip";
    const seg = encodeURIComponent(href);

    const putRes = await app.request(
      `/api/preferences/movies/${seg}/rating`,
      {
        method: "PUT",
        headers: mutationHeaders(accessToken, csrfToken),
        body: JSON.stringify({ rating: 4, tags: ["plot_good"], notes: "great" }),
      },
      env,
    );
    expect(putRes.status).toBe(200);
    const putBody = (await putRes.json()) as Record<string, unknown>;
    expect(putBody.href).toBe(href);
    expect(putBody.rating).toBe(4);
    expect(putBody.tags).toEqual(["plot_good"]);
    // videoCode = href with leading /video/ stripped then slashes trimmed.
    expect(putBody.video_code).toBe("v/test-roundtrip");

    const getRes = await app.request(
      `/api/preferences/movies/${seg}/rating`,
      { headers: authHeaders(accessToken) },
      env,
    );
    expect(getRes.status).toBe(200);
    const getBody = (await getRes.json()) as Record<string, unknown>;
    expect(getBody.rating).toBe(4);
    expect(Array.isArray(getBody.tags)).toBe(true);
  });

  // -----------------------------------------------------------------------
  // 2. Invalid tag → 422 preferences.invalid_tags
  // -----------------------------------------------------------------------
  it("rejects an unknown tag with 422 preferences.invalid_tags", async () => {
    const { accessToken, csrfToken } = await login();
    const seg = encodeURIComponent("/v/test-roundtrip");

    const res = await app.request(
      `/api/preferences/movies/${seg}/rating`,
      {
        method: "PUT",
        headers: mutationHeaders(accessToken, csrfToken),
        body: JSON.stringify({ tags: ["not_a_real_tag"] }),
      },
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("preferences.invalid_tags");
  });

  // -----------------------------------------------------------------------
  // 3. Invalid rating → 422 preferences.invalid_rating
  // -----------------------------------------------------------------------
  it("rejects an out-of-range rating with 422 preferences.invalid_rating", async () => {
    const { accessToken, csrfToken } = await login();
    const seg = encodeURIComponent("/v/test-roundtrip");

    const res = await app.request(
      `/api/preferences/movies/${seg}/rating`,
      {
        method: "PUT",
        headers: mutationHeaders(accessToken, csrfToken),
        body: JSON.stringify({ rating: 9 }),
      },
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("preferences.invalid_rating");
  });

  // -----------------------------------------------------------------------
  // 4. List ratings → items array + numeric total, includes the round-trip row.
  // Depends on the rating PUT in test 1 above (shared D1 storage within this
  // file; vitest runs `it` blocks in declaration order).
  // -----------------------------------------------------------------------
  it("lists ratings with an items array and numeric total", async () => {
    const { accessToken } = await login();

    const res = await app.request(
      "/api/preferences/movies/ratings",
      { headers: authHeaders(accessToken) },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Record<string, unknown>[]; total: number };
    expect(Array.isArray(body.items)).toBe(true);
    expect(typeof body.total).toBe("number");
    expect(body.items.some((r) => r.href === "/v/test-roundtrip")).toBe(true);
  });

  // -----------------------------------------------------------------------
  // 5. Content preference upsert + list (hearted_only).
  // -----------------------------------------------------------------------
  it("upserts a content preference and lists it with hearted as boolean", async () => {
    const { accessToken, csrfToken } = await login();
    const contentId = "/actors/abc";

    const putRes = await app.request(
      `/api/preferences/actor/${encodeURIComponent(contentId)}`,
      {
        method: "PUT",
        headers: mutationHeaders(accessToken, csrfToken),
        body: JSON.stringify({ content_name: "Test Actor", hearted: true }),
      },
      env,
    );
    expect(putRes.status).toBe(200);
    const putBody = (await putRes.json()) as Record<string, unknown>;
    expect(putBody.hearted).toBe(true);
    expect(putBody.content_type).toBe("actor");
    expect(putBody.content_id).toBe(contentId);

    const listRes = await app.request(
      "/api/preferences?content_type=actor&hearted_only=true",
      { headers: authHeaders(accessToken) },
      env,
    );
    expect(listRes.status).toBe(200);
    const listBody = (await listRes.json()) as { items: Record<string, unknown>[] };
    const match = listBody.items.find((r) => r.content_id === contentId);
    expect(match).toBeDefined();
    expect(match!.hearted).toBe(true);
  });

  // -----------------------------------------------------------------------
  // 6. Invalid content_type → 422 preferences.invalid_content_type
  // -----------------------------------------------------------------------
  it("rejects an invalid content_type with 422 preferences.invalid_content_type", async () => {
    const { accessToken, csrfToken } = await login();

    const res = await app.request(
      "/api/preferences/badtype/x",
      {
        method: "PUT",
        headers: mutationHeaders(accessToken, csrfToken),
        body: JSON.stringify({ content_name: "X", hearted: false }),
      },
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("preferences.invalid_content_type");
  });

  // -----------------------------------------------------------------------
  // 7. Invalid weight → 422 preferences.invalid_weight
  // -----------------------------------------------------------------------
  it("rejects an out-of-range weight with 422 preferences.invalid_weight", async () => {
    const { accessToken, csrfToken } = await login();

    const res = await app.request(
      `/api/preferences/actor/${encodeURIComponent("/actors/w")}`,
      {
        method: "PUT",
        headers: mutationHeaders(accessToken, csrfToken),
        body: JSON.stringify({ content_name: "W", hearted: false, weight: 50 }),
      },
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("preferences.invalid_weight");
  });

  // -----------------------------------------------------------------------
  // 8. Metadata not found → 404 preferences.not_found
  // -----------------------------------------------------------------------
  it("returns 404 preferences.not_found for missing metadata", async () => {
    const { accessToken } = await login();

    const res = await app.request(
      `/api/preferences/metadata/${encodeURIComponent("/v/does-not-exist")}`,
      { headers: authHeaders(accessToken) },
      env,
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("preferences.not_found");
  });

  // -----------------------------------------------------------------------
  // 9. Auth required.
  // -----------------------------------------------------------------------
  it("rejects an unauthenticated ratings list with 401", async () => {
    const res = await app.request("/api/preferences/movies/ratings", {}, env);
    expect(res.status).toBe(401);
  });

  // -----------------------------------------------------------------------
  // 10. Non-array tags → 422 preferences.invalid_tags (no 500 TypeError)
  // -----------------------------------------------------------------------
  it("rejects a non-array tags value with 422 preferences.invalid_tags", async () => {
    const { accessToken, csrfToken } = await login();
    const seg = encodeURIComponent("/v/test-roundtrip");

    const res = await app.request(
      `/api/preferences/movies/${seg}/rating`,
      {
        method: "PUT",
        headers: mutationHeaders(accessToken, csrfToken),
        body: JSON.stringify({ tags: "plot_good" }),
      },
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("preferences.invalid_tags");
  });

  // -----------------------------------------------------------------------
  // 11. Malformed JSON body → 422 preferences.invalid_body (no 500)
  // -----------------------------------------------------------------------
  it("rejects a malformed JSON body with 422 preferences.invalid_body", async () => {
    const { accessToken, csrfToken } = await login();
    const seg = encodeURIComponent("/v/test-roundtrip");

    const res = await app.request(
      `/api/preferences/movies/${seg}/rating`,
      {
        method: "PUT",
        headers: mutationHeaders(accessToken, csrfToken),
        body: "{ not valid json",
      },
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("preferences.invalid_body");
  });

  // -----------------------------------------------------------------------
  // 12. Non-numeric weight → 422 preferences.invalid_weight
  // -----------------------------------------------------------------------
  it("rejects a non-numeric weight with 422 preferences.invalid_weight", async () => {
    const { accessToken, csrfToken } = await login();

    const res = await app.request(
      `/api/preferences/actor/${encodeURIComponent("/actors/badweight")}`,
      {
        method: "PUT",
        headers: mutationHeaders(accessToken, csrfToken),
        body: JSON.stringify({ content_name: "X", hearted: false, weight: "heavy" }),
      },
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("preferences.invalid_weight");
  });
});
