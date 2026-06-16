import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { prepareActorSubscriptionUpsert } from "../contract/sql-contract.gen";

async function seed() {
  await env.HISTORY_DB.prepare(
    `CREATE TABLE IF NOT EXISTS ActorSubscription (
      actor_href TEXT PRIMARY KEY,
      actor_name TEXT,
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
      last_seen_href TEXT,
      last_checked_at TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    )`,
  ).run();
}

describe("ADR-055 generated ActorSubscription upsert", () => {
  beforeAll(seed);
  beforeEach(async () => {
    await env.HISTORY_DB.prepare("DELETE FROM ActorSubscription").run();
  });

  it("maps each column to the right value (bind order from the generator)", async () => {
    await prepareActorSubscriptionUpsert(env.HISTORY_DB, {
      actorHref: "/actors/EvkJ",
      actorName: "Alice",
      active: 1,
    }).run();
    const row = await env.HISTORY_DB.prepare(
      "SELECT * FROM ActorSubscription WHERE actor_href = ?",
    )
      .bind("/actors/EvkJ")
      .first<{ actor_href: string; actor_name: string | null; active: number }>();
    expect(row).toMatchObject({
      actor_href: "/actors/EvkJ",
      actor_name: "Alice",
      active: 1,
    });
  });

  it("refreshes name + active on conflict, preserves created_at", async () => {
    await prepareActorSubscriptionUpsert(env.HISTORY_DB, {
      actorHref: "/actors/EvkJ", actorName: "Alice", active: 1,
    }).run();
    const before = await env.HISTORY_DB.prepare(
      "SELECT created_at FROM ActorSubscription WHERE actor_href = ?",
    ).bind("/actors/EvkJ").first<{ created_at: string }>();
    await prepareActorSubscriptionUpsert(env.HISTORY_DB, {
      actorHref: "/actors/EvkJ", actorName: "Alicia", active: 0,
    }).run();
    const after = await env.HISTORY_DB.prepare(
      "SELECT actor_name, active, created_at FROM ActorSubscription WHERE actor_href = ?",
    ).bind("/actors/EvkJ").first<{ actor_name: string; active: number; created_at: string }>();
    expect(after).toMatchObject({ actor_name: "Alicia", active: 0 });
    expect(after!.created_at).toBe(before!.created_at);
  });
});
