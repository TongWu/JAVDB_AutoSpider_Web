import { describe, it, expect } from "vitest";
import { ACTOR_SUBSCRIPTION_UPSERT_SQL } from "../services/subscription-service";

// MUST be character-identical to tests/unit/test_actor_subscription_upsert_parity.py CANONICAL.
const CANONICAL =
  "INSERT INTO ActorSubscription " +
  "(actor_href, actor_name, active, created_at, updated_at) " +
  "VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'), " +
  "strftime('%Y-%m-%dT%H:%M:%fZ','now')) " +
  "ON CONFLICT(actor_href) DO UPDATE SET " +
  "actor_name = excluded.actor_name, active = excluded.active, " +
  "updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')";

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

describe("ActorSubscription upsert SQL parity", () => {
  it("TS upsert matches the canonical cross-backend shape", () => {
    expect(norm(ACTOR_SUBSCRIPTION_UPSERT_SQL)).toBe(CANONICAL);
  });
});
