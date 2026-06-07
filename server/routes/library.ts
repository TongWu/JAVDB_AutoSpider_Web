// --- Library query builders (ADR-018 dual-backend contract) ---
//
// Pure SQL builders for the SQL-backed library views over the AcquisitionOutcome
// table. These are the TypeScript mirror of the Python source of truth and are
// pinned byte-for-byte by the ADR-018 query Contract Golden
// (server/__tests__/query-contract.test.ts). SQL strings and binding order MUST
// stay in sync with Python.
//
// NOTE: the TS Worker backend does not yet expose library route handlers; these
// builders exist now so the contract golden has a conformant TS counterpart.
// Wiring them into live GET handlers is a tracked follow-up (mirrors the
// stats_trend_query builder, which also lands ahead of its handler).

export interface LibraryQuery {
  sql: string;
  bindings: (string | number)[];
}

// State-count aggregation across the whole AcquisitionOutcome table. Mirrors the
// Python library summary builder; takes no params and binds nothing.
export function buildLibrarySummaryQuery(): LibraryQuery {
  return {
    sql: `
      SELECT COALESCE(SUM(CASE WHEN state='queued' THEN 1 ELSE 0 END), 0) AS queued,
             COALESCE(SUM(CASE WHEN state='downloading' THEN 1 ELSE 0 END), 0) AS downloading,
             COALESCE(SUM(CASE WHEN state='completed' THEN 1 ELSE 0 END), 0) AS completed,
             COALESCE(SUM(CASE WHEN state='stalled' THEN 1 ELSE 0 END), 0) AS stalled,
             COALESCE(SUM(CASE WHEN state='failed' THEN 1 ELSE 0 END), 0) AS failed,
             COUNT(*) AS total
      FROM AcquisitionOutcome`,
    bindings: [],
  };
}

// Recent items, optionally filtered by state, newest-queued first. Binding order
// MUST match Python: optional `state` first, then `limit`, then `offset`.
export function buildLibraryRecentQuery(input: {
  state?: string | null;
  limit: number;
  offset: number;
}): LibraryQuery {
  const bindings: (string | number)[] = [];
  let stateClause = "";
  if (input.state !== undefined && input.state !== null) {
    stateClause = "WHERE state = ? ";
    bindings.push(input.state);
  }
  bindings.push(input.limit, input.offset);
  return {
    sql: `
      SELECT qb_hash, video_code, href, category, state, queued_at, completed_at, last_seen_at
      FROM AcquisitionOutcome ${stateClause}ORDER BY queued_at DESC LIMIT ? OFFSET ?`,
    bindings,
  };
}

// Daily completed/stalled/failed counts since the inclusive `cutoff` date.
export function buildLibraryTrendQuery(input: { cutoff: string }): LibraryQuery {
  return {
    sql: `
      SELECT substr(last_seen_at, 1, 10) AS d,
             COALESCE(SUM(CASE WHEN state='completed' THEN 1 ELSE 0 END), 0) AS completed,
             COALESCE(SUM(CASE WHEN state='stalled' THEN 1 ELSE 0 END), 0) AS stalled,
             COALESCE(SUM(CASE WHEN state='failed' THEN 1 ELSE 0 END), 0) AS failed
      FROM AcquisitionOutcome
      WHERE state IN ('completed','stalled','failed') AND last_seen_at >= ?
      GROUP BY d ORDER BY d`,
    bindings: [input.cutoff],
  };
}
