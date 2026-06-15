import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { listSubscriptions, listNewWorks } from "../services/subscription-service";

// ADR-054 WS2 dual-backend parity (Sprint-3 verification fix): the Python repos
// order by a deterministic secondary key (actor_href / video_code ASC) so that
// rows with an identical updated_at / discovered_at come back in a stable order.
// The Worker must match, else the two backends return the same rows in different
// orders. These tests seed ties and pin the secondary sort.
async function seed() {
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

const TS = "2026-06-14T00:00:00.000Z";

describe("Subscription list ordering parity (tie-break matches Python)", () => {
  beforeAll(seed);
  beforeEach(async () => {
    await env.HISTORY_DB.prepare("DELETE FROM ActorSubscription").run();
    await env.HISTORY_DB.prepare("DELETE FROM NewWorks").run();
  });

  it("listSubscriptions breaks an updated_at tie by actor_href ASC", async () => {
    for (const href of ["/actors/CCC", "/actors/AAA", "/actors/BBB"]) {
      await env.HISTORY_DB.prepare(
        "INSERT INTO ActorSubscription (actor_href, actor_name, active, created_at, updated_at) VALUES (?, ?, 1, ?, ?)",
      )
        .bind(href, null, TS, TS)
        .run();
    }
    const { items } = await listSubscriptions(env.HISTORY_DB, false, 200, 0);
    expect(items.map((r) => r.actor_href)).toEqual([
      "/actors/AAA",
      "/actors/BBB",
      "/actors/CCC",
    ]);
  });

  it("listNewWorks breaks a discovered_at tie by video_code ASC", async () => {
    for (const code of ["N-3", "N-1", "N-2"]) {
      await env.HISTORY_DB.prepare(
        "INSERT INTO NewWorks (video_code, href, actor_href, discovered_at) VALUES (?, ?, ?, ?)",
      )
        .bind(code, `/v/${code}`, "/actors/AAA", TS)
        .run();
    }
    const { items } = await listNewWorks(env.HISTORY_DB, null, false, 50, 0);
    expect(items.map((r) => r.video_code)).toEqual(["N-1", "N-2", "N-3"]);
  });
});
