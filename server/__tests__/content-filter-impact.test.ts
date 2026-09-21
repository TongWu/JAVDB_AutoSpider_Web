import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "cloudflare:test";
import { app } from "../app";
import { compareRetainedCohort, listRetainedCohort } from "../services/content-filter-impact";
import contract from "./fixtures/content-filter-impact-contract.json";
import * as impactService from "../services/content-filter-impact";

async function login() {
  const response = await app.request(
    "/api/auth/login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "testpassword123" }),
    },
    env,
  );
  const body = await response.json() as Record<string, string>;
  return { accessToken: body.access_token, csrfToken: body.csrf_token };
}

function headers(accessToken: string, csrfToken?: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
    ...(csrfToken
      ? { "X-CSRF-Token": csrfToken, Cookie: `csrf_token=${csrfToken}` }
      : {}),
  };
}

async function seedTables() {
  await env.REPORTS_DB.prepare(`CREATE TABLE IF NOT EXISTS ContentFilterRule (
    id INTEGER PRIMARY KEY AUTOINCREMENT, dimension TEXT NOT NULL,
    mode TEXT NOT NULL, value TEXT, enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT
  )`).run();
  await env.HISTORY_DB.prepare(`CREATE TABLE IF NOT EXISTS MovieMetadata (
    href TEXT PRIMARY KEY, title TEXT, video_code TEXT, release_date TEXT,
    categories TEXT, updated_at TEXT
  )`).run();
  await env.HISTORY_DB.prepare(`CREATE TABLE IF NOT EXISTS MovieHistory (
    Href TEXT PRIMARY KEY, ActorName TEXT, ActorGender TEXT,
    ActorLink TEXT, SupportingActors TEXT
  )`).run();
  await env.HISTORY_DB.prepare(`CREATE TABLE IF NOT EXISTS ActorMetadata (
    actor_href TEXT PRIMARY KEY, birthdate TEXT, resolved INTEGER
  )`).run();
}

async function seedKnownMovie() {
  await env.HISTORY_DB.prepare(
    `INSERT INTO MovieMetadata
       (href, title, video_code, release_date, categories, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(
    "https://javdb.com/v/one",
    "One",
    "ONE-001",
    "2024-01-01",
    JSON.stringify([{ name: "VR", href: "/tags/vr" }]),
    "2026-09-22T00:00:00.000Z",
  ).run();
  await env.HISTORY_DB.prepare(
    `INSERT INTO MovieHistory
       (Href, ActorName, ActorGender, ActorLink, SupportingActors)
     VALUES (?, ?, ?, ?, ?)`,
  ).bind(
    "https://javdb.com/v/one",
    "Alice",
    "female",
    "https://javdb.com/actors/alice",
    "[]",
  ).run();
  await env.HISTORY_DB.prepare(
    "INSERT INTO ActorMetadata (actor_href, birthdate, resolved) VALUES (?, ?, 1)",
  ).bind("/actors/alice", "2000-01-01").run();
}

describe("Content-filter impact comparison", () => {
  beforeAll(seedTables);

  it.each(contract.age_canonical_cases)("age comparison never converts decimal text to Number: $value", (testCase) => {
    const original = globalThis.Number;
    const guarded = new Proxy(original, {
      apply(target, receiver, args) {
        if (typeof args[0] === "string") throw new Error("numeric age conversion");
        return Reflect.apply(target, receiver, args);
      },
      get(target, property) {
        if (property === "parseInt") return () => { throw new Error("numeric age conversion"); };
        return Reflect.get(target, property);
      },
    });
    vi.stubGlobal("Number", guarded);
    try {
      const rule = { id: -1, dimension: "age", mode: "max_age", value: testCase.value, enabled: true };
      expect(impactService.comparisonRuleError(rule)).toBeNull();
      const row = { ...contract.semantic_cases[0].row,
        actors: [{ name: "Alice", gender: "female", href: "/actors/alice" }],
        actor_birthdates: { "/actors/alice": "2000-01-01" },
      };
      expect(compareRetainedCohort([row], [], [rule])[0].draft).toEqual(testCase.expected);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it.each(contract.portability_route_cases)("portable route and retained adapter: $name", async (testCase) => {
    await seedKnownMovie();
    await env.HISTORY_DB.prepare(
      "UPDATE MovieHistory SET ActorName=?, ActorGender=?, ActorLink=?",
    ).bind(testCase.actor_name, testCase.actor_gender, testCase.actor_link).run();
    const rows = await listRetainedCohort(env.HISTORY_DB, 1);
    expect(rows[0].actors?.[0]).toEqual(testCase.expected_actor);
    await env.REPORTS_DB.prepare(
      "INSERT INTO ContentFilterRule (dimension, mode, value, enabled) VALUES (?, ?, ?, 1)",
    ).bind(testCase.rule.dimension, testCase.rule.mode, testCase.rule.value).run();
    const { accessToken, csrfToken } = await login();
    const listed = await app.request("/api/content-filter", { headers: headers(accessToken) }, env);
    const baseline = await listed.json() as { baseline_version: string };
    const response = await app.request("/api/content-filter/impact", {
      method: "POST", headers: headers(accessToken, csrfToken),
      body: JSON.stringify({ baseline_version: baseline.baseline_version, draft_rules: [testCase.rule] }),
    }, env);
    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, any>;
    expect(body.items[0].draft).toEqual(testCase.expected);
    expect(body.items[0].current).toEqual(testCase.expected);
  });

  it.each(contract.age_canonical_cases)("canonical age through route without numeric conversion: $value", async (testCase) => {
    await seedKnownMovie();
    const { accessToken, csrfToken } = await login();
    const listed = await app.request("/api/content-filter", { headers: headers(accessToken) }, env);
    const baseline = await listed.json() as { baseline_version: string };
    const evaluate = vi.spyOn(impactService, "compareRetainedCohort");
    const response = await app.request("/api/content-filter/impact", {
      method: "POST", headers: headers(accessToken, csrfToken),
      body: JSON.stringify({ baseline_version: baseline.baseline_version, draft_rules: [
        { dimension: "age", mode: "max_age", value: testCase.value, enabled: true },
      ] }),
    }, env);
    try {
      expect(response.status).toBe(200);
      expect(evaluate.mock.calls[0][2][0].value).toBe(testCase.canonical);
      const body = await response.json() as Record<string, any>;
      expect(body.items[0].draft).toEqual(testCase.expected);
    } finally {
      evaluate.mockRestore();
    }
  });

  it.each(contract.oversized_request_cases)("rejects oversized page before cohort access: $name", async (testCase) => {
    const { accessToken, csrfToken } = await login();
    const listed = await app.request("/api/content-filter", { headers: headers(accessToken) }, env);
    const baseline = await listed.json() as { baseline_version: string };
    const cohort = vi.spyOn(impactService, "listRetainedCohort").mockRejectedValue(new Error("must validate before cohort access"));
    try {
      const response = await app.request("/api/content-filter/impact", {
        method: "POST", headers: headers(accessToken, csrfToken),
        body: testCase.raw_request.replace("__CURRENT_BASELINE_VERSION__", baseline.baseline_version),
      }, env);
      expect(response.status).toBe(testCase.expected.status);
      expect(await response.json()).toEqual(testCase.expected.body);
      expect(cohort).not.toHaveBeenCalled();
    } finally {
      cohort.mockRestore();
    }
  });

  it("accepts the maximum portable page", async () => {
    const { accessToken, csrfToken } = await login();
    const listed = await app.request("/api/content-filter", { headers: headers(accessToken) }, env);
    const baseline = await listed.json() as { baseline_version: string };
    const response = await app.request("/api/content-filter/impact", {
      method: "POST", headers: headers(accessToken, csrfToken),
      body: JSON.stringify({ baseline_version: baseline.baseline_version, draft_rules: [], page: 9007199254740991 }),
    }, env);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ page: 9007199254740991, items: [] });
  });

  beforeEach(async () => {
    await env.REPORTS_DB.prepare("DELETE FROM ContentFilterRule").run();
    await env.REPORTS_DB.prepare("DELETE FROM sqlite_sequence WHERE name = 'ContentFilterRule'").run();
    await env.HISTORY_DB.prepare("DELETE FROM MovieMetadata").run();
    await env.HISTORY_DB.prepare("DELETE FROM MovieHistory").run();
    await env.HISTORY_DB.prepare("DELETE FROM ActorMetadata").run();
  });

  it("reports a newly-kept movie without mutating retained or saved rows", async () => {
    await seedKnownMovie();
    await env.REPORTS_DB.prepare(
      "INSERT INTO ContentFilterRule (dimension, mode, value, enabled) VALUES ('tag', 'exclude', 'VR', 1)",
    ).run();
    const { accessToken, csrfToken } = await login();
    const listed = await app.request(
      "/api/content-filter",
      { headers: headers(accessToken) },
      env,
    );
    const baseline = await listed.json() as Record<string, unknown>;

    const response = await app.request(
      "/api/content-filter/impact",
      {
        method: "POST",
        headers: headers(accessToken, csrfToken),
        body: JSON.stringify({
          baseline_version: baseline.baseline_version,
          draft_rules: [{
            id: -1,
            dimension: "tag",
            mode: "include",
            value: "VR",
            enabled: true,
          }],
        }),
      },
      env,
    );

    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, any>;
    expect(body.baseline_version).toBe("sha256:cf12885b1315b309abacd4da1f4fb4c8d170f500a036cdaf2b84528dc79d03d4");
    expect(body.cohort_version).toBe("sha256:74e3ae1457cdd0a60558ecf6835ddbc2d2987a5acf9e6378a98d10c8bc47b6ca");
    expect(body.items[0].transition).toBe("newly_kept");
    expect(body.items[0].current.reasons).toEqual(["excluded by tag rule: VR"]);
    expect(body.summary.current).toEqual({ keep: 0, drop: 1, unknown: 0 });
    expect((await env.REPORTS_DB.prepare("SELECT COUNT(*) AS n FROM ContentFilterRule").first<{ n: number }>())?.n).toBe(1);
    expect((await env.HISTORY_DB.prepare("SELECT COUNT(*) AS n FROM MovieMetadata").first<{ n: number }>())?.n).toBe(1);
  });

  it("preserves unknown metadata and deterministic pagination limits", async () => {
    await env.HISTORY_DB.prepare(
      `INSERT INTO MovieMetadata
         (href, title, video_code, release_date, categories, updated_at)
       VALUES ('/v/unknown', 'Unknown', 'UNK', NULL, NULL, '2026-09-22')`,
    ).run();
    const { accessToken, csrfToken } = await login();
    const listed = await app.request("/api/content-filter", { headers: headers(accessToken) }, env);
    const baseline = await listed.json() as Record<string, unknown>;
    const response = await app.request(
      "/api/content-filter/impact",
      {
        method: "POST",
        headers: headers(accessToken, csrfToken),
        body: JSON.stringify({
          baseline_version: baseline.baseline_version,
          draft_rules: [{ dimension: "tag", mode: "exclude", value: "VR", enabled: true }],
          cohort_size: 500,
          page_size: 100,
        }),
      },
      env,
    );
    const body = await response.json() as Record<string, any>;
    expect(body.items[0].draft).toEqual({
      outcome: "unknown",
      reasons: ["missing metadata: categories"],
    });
    expect(body.coverage.draft_known).toBe(0);
  });

  it("returns 409 when the saved baseline or retained cohort changed", async () => {
    await seedKnownMovie();
    const { accessToken, csrfToken } = await login();
    const listed = await app.request("/api/content-filter", { headers: headers(accessToken) }, env);
    const baseline = await listed.json() as Record<string, unknown>;
    await env.REPORTS_DB.prepare(
      "INSERT INTO ContentFilterRule (dimension, mode, value, enabled) VALUES ('tag', 'exclude', 'VR', 1)",
    ).run();
    const staleBaseline = await app.request(
      "/api/content-filter/impact",
      {
        method: "POST",
        headers: headers(accessToken, csrfToken),
        body: JSON.stringify({ baseline_version: baseline.baseline_version, draft_rules: [] }),
      },
      env,
    );
    expect(staleBaseline.status).toBe(409);
    const staleBaselineBody = await staleBaseline.json() as Record<string, any>;
    const expectedBaseline = JSON.parse(JSON.stringify(contract.conflict_envelopes.baseline_changed).replace(
      "__CURRENT_BASELINE_VERSION__",
      staleBaselineBody.detail.baseline_version,
    ));
    expect(staleBaselineBody).toEqual(expectedBaseline);

    const relisted = await app.request("/api/content-filter", { headers: headers(accessToken) }, env);
    const current = await relisted.json() as Record<string, unknown>;
    const staleCohort = await app.request(
      "/api/content-filter/impact",
      {
        method: "POST",
        headers: headers(accessToken, csrfToken),
        body: JSON.stringify({
          baseline_version: current.baseline_version,
          draft_rules: [],
          expected_cohort_version: "sha256:stale",
        }),
      },
      env,
    );
    expect(staleCohort.status).toBe(409);
    const staleCohortBody = await staleCohort.json() as Record<string, any>;
    const expectedCohort = JSON.parse(JSON.stringify(contract.conflict_envelopes.cohort_changed).replace(
      "__CURRENT_COHORT_VERSION__",
      staleCohortBody.detail.cohort_version,
    ));
    expect(staleCohortBody).toEqual(expectedCohort);
  });

  it("rejects over-limit cohorts and catastrophic draft regexes", async () => {
    const { accessToken, csrfToken } = await login();
    const listed = await app.request("/api/content-filter", { headers: headers(accessToken) }, env);
    const baseline = await listed.json() as Record<string, unknown>;
    const tooLarge = await app.request(
      "/api/content-filter/impact",
      {
        method: "POST",
        headers: headers(accessToken, csrfToken),
        body: JSON.stringify({ baseline_version: baseline.baseline_version, draft_rules: [], cohort_size: 5001 }),
      },
      env,
    );
    expect(tooLarge.status).toBe(422);
    const expensive = await app.request(
      "/api/content-filter/impact",
      {
        method: "POST",
        headers: headers(accessToken, csrfToken),
        body: JSON.stringify({
          baseline_version: baseline.baseline_version,
          draft_rules: [{ dimension: "tag", mode: "regex_exclude", value: "(a+)+", enabled: true }],
        }),
      },
      env,
    );
    expect(expensive.status).toBe(422);
    expect((await expensive.json() as Record<string, any>).detail.error.code).toBe("content_filter.invalid_value");
  });

  it("matches the shared validation contract and accepts a null cohort precondition", async () => {
    const { accessToken, csrfToken } = await login();
    const listed = await app.request("/api/content-filter", { headers: headers(accessToken) }, env);
    const baseline = await listed.json() as Record<string, unknown>;
    for (const testCase of contract.validation_cases) {
      const rule = { ...testCase.rule };
      if ("repeat_value" in testCase) {
        rule.value = testCase.repeat_value.character.repeat(testCase.repeat_value.count);
      }
      const response = await app.request(
        "/api/content-filter/impact",
        {
          method: "POST",
          headers: headers(accessToken, csrfToken),
          body: JSON.stringify({ baseline_version: baseline.baseline_version, draft_rules: [rule] }),
        },
        env,
      );
      expect(response.status, testCase.name).toBe(testCase.expected.status);
      expect(await response.json(), testCase.name).toEqual(testCase.expected.body);
    }
    const nullPrecondition = await app.request(
      "/api/content-filter/impact",
      {
        method: "POST",
        headers: headers(accessToken, csrfToken),
        body: JSON.stringify({
          baseline_version: baseline.baseline_version,
          draft_rules: [],
          expected_cohort_version: null,
        }),
      },
      env,
    );
    expect(nullPrecondition.status).toBe(200);
  });

  it("matches shared structural 422 envelopes and accepted default/null rules", async () => {
    const { accessToken, csrfToken } = await login();
    const listed = await app.request("/api/content-filter", { headers: headers(accessToken) }, env);
    const baseline = await listed.json() as Record<string, unknown>;
    for (const testCase of contract.request_validation_cases) {
      const request = JSON.parse(JSON.stringify(testCase.request).replace(
        "__CURRENT_BASELINE_VERSION__",
        String(baseline.baseline_version),
      ));
      const response = await app.request("/api/content-filter/impact", {
        method: "POST",
        headers: headers(accessToken, csrfToken),
        body: JSON.stringify(request),
      }, env);
      expect(response.status, testCase.name).toBe(testCase.expected.status);
      expect(await response.json(), testCase.name).toEqual(testCase.expected.body);
    }
    for (const testCase of contract.accepted_rule_cases) {
      const rule = { ...testCase.rule };
      if ("repeat_value" in testCase) {
        rule.value = testCase.repeat_value.character.repeat(testCase.repeat_value.count);
      }
      const response = await app.request("/api/content-filter/impact", {
        method: "POST",
        headers: headers(accessToken, csrfToken),
        body: JSON.stringify({ baseline_version: baseline.baseline_version, draft_rules: [rule] }),
      }, env);
      expect(response.status, testCase.name).toBe(200);
    }
  });

  it("runs the shared semantic corpus through the portable evaluator", () => {
    for (const testCase of contract.semantic_cases) {
      const decision = compareRetainedCohort(
        [testCase.row],
        [],
        testCase.rules,
      )[0].draft;
      expect(decision, testCase.name).toEqual(testCase.expected);
    }
  });

  it("treats malformed retained category members as unknown", async () => {
    const testCase = contract.retained_metadata_cases[0];
    await env.HISTORY_DB.prepare(
      `INSERT INTO MovieMetadata
         (href, title, video_code, release_date, categories, updated_at)
       VALUES ('/v/bad-member', 'Bad', 'BAD', '2024-01-01', ?, '2026-09-22')`,
    ).bind(testCase.categories).run();

    const rows = await listRetainedCohort(env.HISTORY_DB, 1);
    const decision = compareRetainedCohort(rows, [], testCase.rules)[0].draft;

    expect(decision).toEqual(testCase.expected);
  });

  it("rejects an incompatible persisted regex without changing the save contract", async () => {
    await env.REPORTS_DB.prepare(
      "INSERT INTO ContentFilterRule (dimension, mode, value, enabled) VALUES ('actor', 'regex_exclude', '(?s).', 1)",
    ).run();
    const { accessToken, csrfToken } = await login();
    const listed = await app.request("/api/content-filter", { headers: headers(accessToken) }, env);
    const baseline = await listed.json() as Record<string, unknown>;
    const response = await app.request(
      "/api/content-filter/impact",
      {
        method: "POST",
        headers: headers(accessToken, csrfToken),
        body: JSON.stringify({ baseline_version: baseline.baseline_version, draft_rules: [] }),
      },
      env,
    );
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual(contract.validation_cases[0].expected.body);
  });
});
