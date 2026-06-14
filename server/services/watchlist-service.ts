// Watch-intent (watchlist) D1 queries (ADR-054 WS1).
// Keep this module free of Hono / c.env references; callers pass the binding.

export interface WatchIntentRow {
  video_code: string;
  href: string;
  status: string;
  notes: string | null;
  status_at: string | null;
  updated_at: string;
}

// Byte-mirrored with javdb/storage/repos/watchlist_repo.py WATCH_INTENT_UPSERT_SQL
// (ADR-017 dual-backend parity). Pinned by watch-intent-upsert-parity.test.ts.
export const WATCH_INTENT_UPSERT_SQL = `
    INSERT INTO WatchIntent (video_code, href, status, notes, status_at, updated_at)
    VALUES (?, ?, ?, ?,
        strftime('%Y-%m-%dT%H:%M:%fZ','now'),
        strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(video_code) DO UPDATE SET
        href       = excluded.href,
        status     = excluded.status,
        notes      = COALESCE(excluded.notes, notes),
        status_at  = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`;

export async function upsertWatchIntent(
  db: D1Database,
  videoCode: string,
  href: string,
  status: string,
  notes: string | null,
): Promise<WatchIntentRow> {
  await db.prepare(WATCH_INTENT_UPSERT_SQL).bind(videoCode, href, status, notes).run();
  return (await getWatchIntent(db, videoCode))!;
}

export async function getWatchIntent(
  db: D1Database,
  videoCode: string,
): Promise<WatchIntentRow | null> {
  return db
    .prepare("SELECT * FROM WatchIntent WHERE video_code = ?")
    .bind(videoCode)
    .first<WatchIntentRow>();
}

export async function listWatchIntents(
  db: D1Database,
  status: string | null,
  limit: number,
  offset: number,
): Promise<{ items: WatchIntentRow[]; total: number }> {
  const where = status ? "WHERE status = ?" : "";
  const filterBindings: string[] = status ? [status] : [];

  const total =
    (await db
      .prepare(`SELECT COUNT(*) AS n FROM WatchIntent ${where}`)
      .bind(...filterBindings)
      .first<{ n: number }>())?.n ?? 0;

  const rows = await db
    .prepare(
      `SELECT * FROM WatchIntent ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`,
    )
    .bind(...filterBindings, limit, offset)
    .all<WatchIntentRow>();

  return { items: rows.results, total };
}

export async function deleteWatchIntent(
  db: D1Database,
  videoCode: string,
): Promise<boolean> {
  const res = await db
    .prepare("DELETE FROM WatchIntent WHERE video_code = ?")
    .bind(videoCode)
    .run();
  return (res.meta?.changes ?? 0) > 0;
}
