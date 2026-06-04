import { describe, it, expect } from "vitest";
import { buildMovieQuery, buildTorrentQuery } from "../routes/history";
import { SUMMARY_DEDUP_FREED_SQL } from "../routes/stats";

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
});
