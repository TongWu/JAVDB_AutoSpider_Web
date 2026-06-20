/**
 * Torrent quality review routes tests (ADR-024 Phase 2, read-only).
 *
 * Pins the contract guarantees of the /api/quality/* surface mirrored from the
 * Python router (apps/api/routers/quality.py): evaluation list shape + field
 * pruning, integer->boolean coercion, reasons JSON parsing, movie_href filter +
 * shadow_rank ordering, limit<=0 -> 400, evidence lookup with info_hash
 * normalization + role/version pinning, 404s, and auth enforcement.
 *
 * The two quality tables (TorrentQualityEvidence, TorrentQualityEvaluation) live
 * in REPORTS_DB and are NOT created by table-init, so we create + seed them here.
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
// Table setup + seed (quality tables are not created by table-init)
// ---------------------------------------------------------------------------

async function seedQualityTables() {
  await env.REPORTS_DB.prepare(
    `CREATE TABLE IF NOT EXISTS TorrentQualityEvidence (
      info_hash TEXT NOT NULL, probe_schema_version TEXT NOT NULL, target_role TEXT NOT NULL,
      probe_target_name TEXT, metadata_status TEXT, metadata_started_at TEXT, metadata_completed_at TEXT,
      total_size_bytes INTEGER, main_video_size_bytes INTEGER, main_video_ratio REAL,
      video_file_count INTEGER, subtitle_file_count INTEGER, non_video_file_count INTEGER,
      junk_size_bytes INTEGER, junk_size_ratio REAL, suspicious_file_count INTEGER,
      features_json TEXT, reasons_json TEXT, source_fingerprint TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      PRIMARY KEY (info_hash, probe_schema_version, target_role)
    )`,
  ).run();

  await env.REPORTS_DB.prepare(
    `CREATE TABLE IF NOT EXISTS TorrentQualityEvaluation (
      info_hash TEXT NOT NULL, movie_href TEXT NOT NULL, scoring_version TEXT NOT NULL,
      video_code TEXT, javdb_category TEXT, magnet_name TEXT, javdb_tags_json TEXT, javdb_size_text TEXT,
      inferred_category TEXT, category_consistent INTEGER, subtitle_evidence TEXT,
      resolution_consistent INTEGER, source_trust TEXT, score REAL, shadow_rank INTEGER,
      would_replace_current_choice INTEGER, policy_mode TEXT, decision TEXT, reasons_json TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      PRIMARY KEY (info_hash, movie_href, scoring_version)
    )`,
  ).run();

  // Two evaluations for one movie — distinct shadow_ranks to exercise ORDER BY
  // shadow_rank ASC. eval_a: category_consistent=1, scored columns NULL (the
  // "not yet scored" reality). eval_b: category_consistent=0, reasons with a
  // non-string member to verify filtering.
  await env.REPORTS_DB.prepare(
    `INSERT OR REPLACE INTO TorrentQualityEvaluation
       (info_hash, movie_href, scoring_version, video_code, javdb_category, magnet_name,
        javdb_tags_json, javdb_size_text, inferred_category, category_consistent, subtitle_evidence,
        resolution_consistent, source_trust, score, shadow_rank, would_replace_current_choice,
        policy_mode, decision, reasons_json)
     VALUES
       ('hash_qa1_a', '/v/QA-001', 'adr024-score-v1', 'QA-001', '4K', 'QA-001 4K',
        '["uncensored"]', '11 GB', '4K', 1, 'embedded',
        NULL, NULL, 0.82, 2, NULL, NULL, NULL, '["junk_low","size_ok"]'),
       ('hash_qa1_b', '/v/QA-001', 'adr024-score-v1', 'QA-001', '4K', 'QA-001 SD',
        '[]', '1 GB', 'SD', 0, NULL,
        NULL, NULL, 0.40, 1, NULL, NULL, NULL, '["category_mismatch", 123, null]')`,
  ).run();

  // Null + malformed reasons rows for a second movie.
  await env.REPORTS_DB.prepare(
    `INSERT OR REPLACE INTO TorrentQualityEvaluation
       (info_hash, movie_href, scoring_version, category_consistent, reasons_json)
     VALUES
       ('hash_qa2_a', '/v/QA-002', 'adr024-score-v1', NULL, NULL),
       ('hash_qa2_b', '/v/QA-002', 'adr024-score-v1', NULL, '{not valid json')`,
  ).run();

  // Assist-mode movie: a quality probe (rank 1) outranks the production download
  // (rank 2, flagged would_replace_current_choice=1). Used by recommendations +
  // needs-review. reason_diff = recommended reasons - current reasons.
  await env.REPORTS_DB.prepare(
    `INSERT OR REPLACE INTO TorrentQualityEvaluation
       (info_hash, movie_href, scoring_version, video_code, javdb_category, magnet_name,
        javdb_tags_json, javdb_size_text, inferred_category, category_consistent, subtitle_evidence,
        resolution_consistent, source_trust, score, shadow_rank, would_replace_current_choice,
        policy_mode, decision, reasons_json)
     VALUES
       ('hash_qa3_prod', '/v/QA-003', 'adr024-score-v1', 'QA-003', '4K', 'QA-003 prod',
        '[]', '8 GB', '4K', 1, NULL,
        NULL, NULL, 0.55, 2, 1, 'assist', NULL, '["junk_high"]'),
       ('hash_qa3_probe', '/v/QA-003', 'adr024-score-v1', 'QA-003', '4K', 'QA-003 probe',
        '[]', '14 GB', '4K', 1, 'embedded',
        NULL, NULL, 0.91, 1, NULL, 'assist', NULL,
        '["junk_high","size_better","subs_present"]')`,
  ).run();

  // A row flagged decision='needs_review' (without would_replace) — also surfaces
  // in the needs-review queue.
  await env.REPORTS_DB.prepare(
    `INSERT OR REPLACE INTO TorrentQualityEvaluation
       (info_hash, movie_href, scoring_version, javdb_category, shadow_rank,
        would_replace_current_choice, decision, reasons_json)
     VALUES
       ('hash_qa4_a', '/v/QA-004', 'adr024-score-v1', 'HD', 1, NULL, 'needs_review', '["low_confidence"]')`,
  ).run();

  // Operator review-label table (mirrors javdb/migrations/d1/
  // 2026_06_20_add_torrent_quality_review_label.sql byte-for-byte).
  await env.REPORTS_DB.prepare(
    `CREATE TABLE IF NOT EXISTS TorrentQualityReviewLabel (
      info_hash        TEXT NOT NULL,
      movie_href       TEXT NOT NULL,
      scoring_version  TEXT NOT NULL,
      label            TEXT NOT NULL
                           CHECK (label IN ('accept', 'reject', 'skip')),
      reviewer         TEXT,
      note             TEXT,
      reviewed_at      TEXT NOT NULL,
      PRIMARY KEY (info_hash, movie_href, scoring_version)
    )`,
  ).run();
  await env.REPORTS_DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_quality_review_label_movie
       ON TorrentQualityReviewLabel(movie_href)`,
  ).run();

  // Production-download evidence (stored lowercase) + a runner-up row with the
  // same hash that must NOT be returned by the production lookup.
  await env.REPORTS_DB.prepare(
    `INSERT OR REPLACE INTO TorrentQualityEvidence
       (info_hash, probe_schema_version, target_role, probe_target_name, metadata_status,
        metadata_started_at, metadata_completed_at, total_size_bytes, main_video_size_bytes,
        main_video_ratio, video_file_count, subtitle_file_count, non_video_file_count,
        junk_size_bytes, junk_size_ratio, suspicious_file_count, features_json, reasons_json,
        source_fingerprint)
     VALUES
       ('abcdef0123456789', 'adr024-probe-v1', 'production_download', 'prod-qb', 'complete',
        '2026-05-31T00:00:00.000Z', '2026-05-31T00:01:00.000Z', 10737418240, 10000000000,
        0.93, 1, 2, 1, 512, 0.00005, 0, '{"x":1}', '["clean"]', 'fp-prod'),
       ('deadbeefcafebabe', 'adr024-probe-v1', 'runner_up', 'shadow-qb', 'complete',
        NULL, NULL, 2147483648, 2000000000, 0.93, 1, 0, 0, 0, 0.0, 0, '{}', '[]', 'fp-runner')`,
  ).run();
}

describe("Quality review routes", () => {
  beforeAll(async () => {
    await seedQualityTables();
  });

  // -----------------------------------------------------------------------
  // 1. Recent evaluations: items array; only schema fields surfaced.
  // -----------------------------------------------------------------------
  it("lists recent evaluations and emits only the schema fields", async () => {
    const { accessToken } = await login();
    const res = await app.request(
      "/api/quality/evaluations",
      { headers: authHeaders(accessToken) },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Record<string, unknown>[] };
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBeGreaterThanOrEqual(4);

    const item = body.items.find((r) => r.info_hash === "hash_qa1_a")!;
    expect(item).toBeDefined();
    // Schema fields present (scored columns null — not yet scored).
    expect(item.shadow_rank).toBe(2);
    expect(item.would_replace_current_choice).toBeNull();
    expect(item.decision).toBeNull();
    expect(item.policy_mode).toBeNull();
    // Repo SELECTs these columns but pydantic drops them — must not leak.
    expect(item).not.toHaveProperty("javdb_tags");
    expect(item).not.toHaveProperty("javdb_tags_json");
    expect(item).not.toHaveProperty("javdb_size_text");
    expect(item).not.toHaveProperty("resolution_consistent");
    expect(item).not.toHaveProperty("source_trust");
  });

  // -----------------------------------------------------------------------
  // 2. movie_href filter + shadow_rank ASC ordering + bool/reasons shaping.
  // -----------------------------------------------------------------------
  it("filters by movie_href, orders by shadow_rank, and shapes bools/reasons", async () => {
    const { accessToken } = await login();
    const res = await app.request(
      `/api/quality/evaluations?movie_href=${encodeURIComponent("/v/QA-001")}`,
      { headers: authHeaders(accessToken) },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: { info_hash: string; shadow_rank: number; category_consistent: boolean | null; reasons: string[] }[];
    };
    expect(body.items.map((r) => r.info_hash)).toEqual(["hash_qa1_b", "hash_qa1_a"]);

    const a = body.items.find((r) => r.info_hash === "hash_qa1_a")!;
    const b = body.items.find((r) => r.info_hash === "hash_qa1_b")!;
    expect(a.category_consistent).toBe(true); // 1 -> true
    expect(b.category_consistent).toBe(false); // 0 -> false
    expect(a.reasons).toEqual(["junk_low", "size_ok"]);
    expect(b.reasons).toEqual(["category_mismatch"]); // non-string members filtered
  });

  // -----------------------------------------------------------------------
  // 3. Null + malformed reasons collapse to [], null bool stays null.
  // -----------------------------------------------------------------------
  it("handles null and malformed reasons_json gracefully", async () => {
    const { accessToken } = await login();
    const res = await app.request(
      `/api/quality/evaluations?movie_href=${encodeURIComponent("/v/QA-002")}`,
      { headers: authHeaders(accessToken) },
      env,
    );
    const body = (await res.json()) as {
      items: { info_hash: string; category_consistent: boolean | null; reasons: string[] }[];
    };
    for (const item of body.items) {
      expect(item.category_consistent).toBeNull();
      expect(item.reasons).toEqual([]);
    }
  });

  // -----------------------------------------------------------------------
  // 4. limit cap honoured (limit=1 -> at most 1 row).
  // -----------------------------------------------------------------------
  it("respects the limit parameter", async () => {
    const { accessToken } = await login();
    const res = await app.request(
      "/api/quality/evaluations?limit=1",
      { headers: authHeaders(accessToken) },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[] };
    expect(body.items.length).toBe(1);
  });

  // -----------------------------------------------------------------------
  // 5. limit <= 0 -> 400 quality.invalid_limit.
  // -----------------------------------------------------------------------
  it("rejects a non-positive limit with 400", async () => {
    const { accessToken } = await login();
    const res = await app.request(
      "/api/quality/evaluations?limit=0",
      { headers: authHeaders(accessToken) },
      env,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("quality.invalid_limit");
  });

  // -----------------------------------------------------------------------
  // 6. Evidence lookup normalizes info_hash and pins role/version.
  // -----------------------------------------------------------------------
  it("returns production evidence for an upper-cased info_hash", async () => {
    const { accessToken } = await login();
    const res = await app.request(
      "/api/quality/evidence/ABCDEF0123456789", // upper-case -> normalized to lower
      { headers: authHeaders(accessToken) },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.info_hash).toBe("abcdef0123456789");
    expect(body.target_role).toBe("production_download");
    expect(body.probe_schema_version).toBe("adr024-probe-v1");
    expect(body.total_size_bytes).toBe(10737418240);
    expect(body.reasons).toEqual(["clean"]);
    // Columns the repo SELECTs but pydantic drops — must not leak.
    expect(body).not.toHaveProperty("features");
    expect(body).not.toHaveProperty("features_json");
    expect(body).not.toHaveProperty("source_fingerprint");
    expect(body).not.toHaveProperty("metadata_started_at");
  });

  // -----------------------------------------------------------------------
  // 7. A hash present only under a non-production role -> 404.
  // -----------------------------------------------------------------------
  it("does not return runner-up-only evidence under the production role", async () => {
    const { accessToken } = await login();
    const res = await app.request(
      "/api/quality/evidence/deadbeefcafebabe",
      { headers: authHeaders(accessToken) },
      env,
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("quality.evidence_not_found");
  });

  // -----------------------------------------------------------------------
  // 8. Missing evidence -> 404.
  // -----------------------------------------------------------------------
  it("returns 404 for unknown info_hash", async () => {
    const { accessToken } = await login();
    const res = await app.request(
      "/api/quality/evidence/nope",
      { headers: authHeaders(accessToken) },
      env,
    );
    expect(res.status).toBe(404);
  });

  // -----------------------------------------------------------------------
  // 9. Auth required.
  // -----------------------------------------------------------------------
  it("rejects an unauthenticated request with 401", async () => {
    const res = await app.request("/api/quality/evaluations", {}, env);
    expect(res.status).toBe(401);
  });

  // -----------------------------------------------------------------------
  // 10. Recommendations: a probe outranks the production pick.
  // -----------------------------------------------------------------------
  it("builds current-vs-recommended with a reason diff when a probe wins", async () => {
    const { accessToken } = await login();
    const res = await app.request(
      `/api/quality/recommendations?movie_href=${encodeURIComponent("/v/QA-003")}`,
      { headers: authHeaders(accessToken) },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: {
        javdb_category: string;
        current: { info_hash: string } | null;
        recommended: { info_hash: string } | null;
        reason_diff: string[];
      }[];
    };
    expect(body.items.length).toBe(1);
    const item = body.items[0];
    expect(item.javdb_category).toBe("4K");
    expect(item.current?.info_hash).toBe("hash_qa3_prod"); // flagged would_replace
    expect(item.recommended?.info_hash).toBe("hash_qa3_probe"); // shadow_rank 1
    expect(item.reason_diff).toEqual(["size_better", "subs_present"]);
  });

  // -----------------------------------------------------------------------
  // 11. Recommendations: production already rank 1 -> current == recommended, no diff.
  // -----------------------------------------------------------------------
  it("returns current == recommended with empty diff when nothing is flagged", async () => {
    const { accessToken } = await login();
    const res = await app.request(
      `/api/quality/recommendations?movie_href=${encodeURIComponent("/v/QA-001")}`,
      { headers: authHeaders(accessToken) },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: {
        current: { info_hash: string } | null;
        recommended: { info_hash: string } | null;
        reason_diff: string[];
      }[];
    };
    expect(body.items.length).toBe(1);
    const item = body.items[0];
    expect(item.recommended?.info_hash).toBe("hash_qa1_b"); // shadow_rank 1
    expect(item.current?.info_hash).toBe("hash_qa1_b"); // falls back to rank 1
    expect(item.reason_diff).toEqual([]);
  });

  // -----------------------------------------------------------------------
  // 12. Recommendations require movie_href -> 400.
  // -----------------------------------------------------------------------
  it("rejects recommendations without movie_href", async () => {
    const { accessToken } = await login();
    const res = await app.request(
      "/api/quality/recommendations",
      { headers: authHeaders(accessToken) },
      env,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("quality.movie_href_required");
  });

  // -----------------------------------------------------------------------
  // 13. needs-review: surfaces would_replace=1 OR decision='needs_review' only.
  // -----------------------------------------------------------------------
  it("lists only evaluations that need review", async () => {
    const { accessToken } = await login();
    const res = await app.request(
      "/api/quality/needs-review",
      { headers: authHeaders(accessToken) },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { info_hash: string }[] };
    const hashes = body.items.map((r) => r.info_hash);
    expect(hashes).toContain("hash_qa3_prod"); // would_replace_current_choice=1
    expect(hashes).toContain("hash_qa4_a"); // decision='needs_review'
    expect(hashes).not.toContain("hash_qa3_probe"); // assist, not flagged
    expect(hashes).not.toContain("hash_qa1_a"); // plain evaluation
  });

  // -----------------------------------------------------------------------
  // 14. needs-review limit <= 0 -> 400.
  // -----------------------------------------------------------------------
  it("rejects a non-positive needs-review limit with 400", async () => {
    const { accessToken } = await login();
    const res = await app.request(
      "/api/quality/needs-review?limit=0",
      { headers: authHeaders(accessToken) },
      env,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("quality.invalid_limit");
  });

  // -----------------------------------------------------------------------
  // 15. review-labels: write + persist, reviewer from JWT, idempotent overwrite.
  // -----------------------------------------------------------------------
  it("records a review label and overwrites idempotently on resubmit", async () => {
    const { accessToken, csrfToken } = await login();
    const payload = {
      info_hash: "hash_qa3_probe",
      movie_href: "/v/QA-003",
      scoring_version: "adr024-score-v1",
      label: "accept",
      note: "looks good",
    };
    const res = await app.request(
      "/api/quality/review-labels",
      { method: "POST", headers: mutationHeaders(accessToken, csrfToken), body: JSON.stringify(payload) },
      env,
    );
    expect(res.status).toBe(200);
    expect((await res.json()) as { status: string }).toEqual({ status: "recorded" });

    const row = await env.REPORTS_DB.prepare(
      `SELECT label, reviewer, note, reviewed_at FROM TorrentQualityReviewLabel
       WHERE info_hash = ? AND movie_href = ? AND scoring_version = ?`,
    )
      .bind("hash_qa3_probe", "/v/QA-003", "adr024-score-v1")
      .first<{ label: string; reviewer: string | null; note: string | null; reviewed_at: string | null }>();
    expect(row?.label).toBe("accept");
    expect(row?.reviewer).toBe("admin"); // JWT subject
    expect(row?.note).toBe("looks good");
    expect(row?.reviewed_at).toBeTruthy();

    // Resubmit with a different label + null note -> overwrite, still one row.
    const res2 = await app.request(
      "/api/quality/review-labels",
      {
        method: "POST",
        headers: mutationHeaders(accessToken, csrfToken),
        body: JSON.stringify({ ...payload, label: "reject", note: undefined }),
      },
      env,
    );
    expect(res2.status).toBe(200);

    const after = await env.REPORTS_DB.prepare(
      `SELECT label, note, COUNT(*) AS n FROM TorrentQualityReviewLabel
       WHERE info_hash = ? AND movie_href = ? AND scoring_version = ?`,
    )
      .bind("hash_qa3_probe", "/v/QA-003", "adr024-score-v1")
      .first<{ label: string; note: string | null; n: number }>();
    expect(after?.n).toBe(1);
    expect(after?.label).toBe("reject");
    expect(after?.note).toBeNull();
  });

  // -----------------------------------------------------------------------
  // 16. review-labels validation: missing field + invalid label -> 422.
  // -----------------------------------------------------------------------
  it("rejects review labels with a missing field or invalid label", async () => {
    const { accessToken, csrfToken } = await login();
    const missing = await app.request(
      "/api/quality/review-labels",
      {
        method: "POST",
        headers: mutationHeaders(accessToken, csrfToken),
        body: JSON.stringify({ info_hash: "h", movie_href: "/v/x", label: "accept" }), // no scoring_version
      },
      env,
    );
    expect(missing.status).toBe(422);

    const badLabel = await app.request(
      "/api/quality/review-labels",
      {
        method: "POST",
        headers: mutationHeaders(accessToken, csrfToken),
        body: JSON.stringify({
          info_hash: "h",
          movie_href: "/v/x",
          scoring_version: "v1",
          label: "maybe",
        }),
      },
      env,
    );
    expect(badLabel.status).toBe(422);
    const body = (await badLabel.json()) as { error: { code: string } };
    expect(body.error.code).toBe("quality.invalid_label");
  });

  // -----------------------------------------------------------------------
  // 17. review-labels enforces CSRF (POST without token) + auth.
  // -----------------------------------------------------------------------
  it("rejects a review label POST without a CSRF token", async () => {
    const { accessToken } = await login();
    const res = await app.request(
      "/api/quality/review-labels",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders(accessToken) },
        body: JSON.stringify({
          info_hash: "h",
          movie_href: "/v/x",
          scoring_version: "v1",
          label: "accept",
        }),
      },
      env,
    );
    expect(res.status).toBe(403);
  });

  it("rejects an unauthenticated review label POST with 401", async () => {
    const res = await app.request(
      "/api/quality/review-labels",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          info_hash: "h",
          movie_href: "/v/x",
          scoring_version: "v1",
          label: "accept",
        }),
      },
      env,
    );
    expect(res.status).toBe(401);
  });
});
