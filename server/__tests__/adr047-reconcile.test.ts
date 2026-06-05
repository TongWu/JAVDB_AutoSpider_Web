import { describe, it, expect } from "vitest";
import { buildMovieQuery, buildTorrentQuery } from "../routes/history";
import { mapSession } from "../routes/sessions";
import {
  SUMMARY_AVG_DURATION_SQL,
  SUMMARY_DEDUP_FREED_SQL,
  SUMMARY_TORRENT_COUNT_SQL,
} from "../routes/stats";

const compact = (sql: string) => sql.replace(/\s+/g, " ").trim();

describe("ADR-047 reconciliation", () => {
  it("caps list total_estimate counts but leaves export counts exact", () => {
    expect(compact(buildMovieQuery({}, false).countSql)).toBe(
      "SELECT MIN(COUNT(*), 10000) AS cnt FROM MovieHistory m",
    );
    expect(compact(buildMovieQuery({}, true).countSql)).toBe(
      "SELECT COUNT(*) AS cnt FROM MovieHistory m",
    );
    expect(compact(buildTorrentQuery({}, false).countSql)).toBe(
      "SELECT MIN(COUNT(*), 10000) AS cnt FROM TorrentHistory t JOIN MovieHistory m ON m.Id = t.MovieHistoryId",
    );
    expect(compact(buildTorrentQuery({}, true).countSql)).toBe(
      "SELECT COUNT(*) AS cnt FROM TorrentHistory t JOIN MovieHistory m ON m.Id = t.MovieHistoryId",
    );
  });

  it("dedup-freed summary query filters on IsDeleted=1", () => {
    expect(SUMMARY_DEDUP_FREED_SQL).toBe(
      "SELECT SUM(ExistingFolderSize) AS total_freed FROM DedupRecords WHERE IsDeleted=1",
    );
    expect(SUMMARY_DEDUP_FREED_SQL).not.toContain("WHERE Status='completed'");
  });

  it("/summary counts TorrentHistory and computes avg_duration from CommittedAt", () => {
    expect(SUMMARY_TORRENT_COUNT_SQL).toBe("SELECT COUNT(*) AS cnt FROM TorrentHistory");
    expect(SUMMARY_AVG_DURATION_SQL).toContain("CommittedAt");
    expect(SUMMARY_AVG_DURATION_SQL).not.toContain("ReportTorrents");
  });

  it("session write_mode falls back to pending", () => {
    const base = {
      Id: "S1",
      Status: null,
      WriteMode: null,
      RunId: null,
      RunAttempt: null,
      DateTimeCreated: "2026-06-02T00:00:00Z",
      ReportType: "daily",
      ReportDate: "2026-06-02",
      FailureReason: null,
    };

    expect(mapSession(base).write_mode).toBe("pending");
    expect(mapSession({ ...base, WriteMode: "pending" }).write_mode).toBe("pending");
  });
});
