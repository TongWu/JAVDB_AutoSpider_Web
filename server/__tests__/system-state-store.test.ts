import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { upsertSystemState } from "../services/system-state-store";

// Pins the shared system_state UPSERT helper extracted from the onboarding and
// system-state routes. The helper is a pure intra-backend dedup (NOT part of
// the query Contract Golden), so these tests assert behavior — insert, in-place
// update on key conflict, and value fidelity — rather than exact SQL text.

async function readState(
  db: D1Database,
  key: string,
): Promise<{ value: string; updated_at: string } | null> {
  return db
    .prepare("SELECT value, updated_at FROM system_state WHERE key = ?")
    .bind(key)
    .first<{ value: string; updated_at: string }>();
}

describe("upsertSystemState", () => {
  beforeAll(async () => {
    await env.OPERATIONS_DB
      .prepare(
        "CREATE TABLE IF NOT EXISTS system_state (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now')))",
      )
      .run();
  });

  it("inserts a new key/value pair with a populated updated_at", async () => {
    await upsertSystemState(env.OPERATIONS_DB, "store_test_new", "v1");

    const row = await readState(env.OPERATIONS_DB, "store_test_new");
    expect(row?.value).toBe("v1");
    expect(row?.updated_at).toBeTruthy();
  });

  it("updates the value in place on key conflict (no duplicate rows)", async () => {
    await upsertSystemState(env.OPERATIONS_DB, "store_test_conflict", "first");
    await upsertSystemState(env.OPERATIONS_DB, "store_test_conflict", "second");

    const row = await readState(env.OPERATIONS_DB, "store_test_conflict");
    expect(row?.value).toBe("second");

    const count = await env.OPERATIONS_DB
      .prepare("SELECT COUNT(*) AS cnt FROM system_state WHERE key = ?")
      .bind("store_test_conflict")
      .first<{ cnt: number }>();
    expect(count?.cnt).toBe(1);
  });

  it("preserves arbitrary string values, including JSON payloads", async () => {
    const json = JSON.stringify(["welcome-banner", "tour"]);
    await upsertSystemState(env.OPERATIONS_DB, "store_test_json", json);

    const row = await readState(env.OPERATIONS_DB, "store_test_json");
    expect(row?.value).toBe(json);
  });

  it("matches the onboarding 'onboarded' write (key='onboarded', value='true')", async () => {
    await upsertSystemState(env.OPERATIONS_DB, "store_test_onboarded", "true");

    const row = await readState(env.OPERATIONS_DB, "store_test_onboarded");
    expect(row?.value).toBe("true");
  });
});
