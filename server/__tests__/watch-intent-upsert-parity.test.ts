import { describe, it, expect } from "vitest";
import { WATCH_INTENT_UPSERT_SQL } from "../services/watchlist-service";

// MUST be character-identical to tests/unit/test_watch_intent_upsert_parity.py CANONICAL.
const CANONICAL =
  "INSERT INTO WatchIntent (video_code, href, status, notes, status_at, updated_at) " +
  "VALUES (?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'), " +
  "strftime('%Y-%m-%dT%H:%M:%fZ','now')) " +
  "ON CONFLICT(video_code) DO UPDATE SET " +
  "href = excluded.href, status = excluded.status, notes = excluded.notes, " +
  "status_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), " +
  "updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')";

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

describe("WatchIntent upsert SQL parity", () => {
  it("TS upsert matches the canonical cross-backend shape", () => {
    expect(norm(WATCH_INTENT_UPSERT_SQL)).toBe(CANONICAL);
  });
});
