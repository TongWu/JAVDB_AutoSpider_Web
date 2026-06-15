import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { prepareSystemStateUpsert } from "../contract/sql-contract.gen";

async function seed() {
  await env.OPERATIONS_DB.prepare(
    `CREATE TABLE IF NOT EXISTS system_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
  ).run();
}

describe("ADR-055 generated system_state upsert", () => {
  beforeAll(seed);
  beforeEach(async () => {
    await env.OPERATIONS_DB.prepare("DELETE FROM system_state").run();
  });

  it("inserts then updates value on conflict (key bind order)", async () => {
    await prepareSystemStateUpsert(env.OPERATIONS_DB, { key: "onboarded", value: "false" }).run();
    await prepareSystemStateUpsert(env.OPERATIONS_DB, { key: "onboarded", value: "true" }).run();
    const row = await env.OPERATIONS_DB.prepare(
      "SELECT value FROM system_state WHERE key = ?",
    ).bind("onboarded").first<{ value: string }>();
    expect(row).toEqual({ value: "true" });
  });
});
