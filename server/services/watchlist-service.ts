// Watch-intent (watchlist) D1 queries (ADR-054 WS1).
// Keep this module free of Hono / c.env references; callers pass the binding.

import { prepareWatchIntentUpsert } from '../contract/sql-contract.gen'

export interface WatchIntentRow {
  video_code: string
  href: string
  status: string
  notes: string | null
  status_at: string | null
  updated_at: string
}

export async function upsertWatchIntent(
  db: D1Database,
  videoCode: string,
  href: string,
  status: string,
  notes: string | null,
): Promise<WatchIntentRow> {
  await prepareWatchIntentUpsert(db, { videoCode, href, status, notes }).run()
  return (await getWatchIntent(db, videoCode))!
}

export async function getWatchIntent(
  db: D1Database,
  videoCode: string,
): Promise<WatchIntentRow | null> {
  return db
    .prepare('SELECT * FROM WatchIntent WHERE video_code = ?')
    .bind(videoCode)
    .first<WatchIntentRow>()
}

export async function listWatchIntents(
  db: D1Database,
  status: string | null,
  limit: number,
  offset: number,
): Promise<{ items: WatchIntentRow[]; total: number }> {
  const where = status ? 'WHERE status = ?' : ''
  const filterBindings: string[] = status ? [status] : []

  const total =
    (
      await db
        .prepare(`SELECT COUNT(*) AS n FROM WatchIntent ${where}`)
        .bind(...filterBindings)
        .first<{ n: number }>()
    )?.n ?? 0

  const rows = await db
    .prepare(`SELECT * FROM WatchIntent ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`)
    .bind(...filterBindings, limit, offset)
    .all<WatchIntentRow>()

  return { items: rows.results, total }
}

export async function deleteWatchIntent(db: D1Database, videoCode: string): Promise<boolean> {
  const res = await db.prepare('DELETE FROM WatchIntent WHERE video_code = ?').bind(videoCode).run()
  return (res.meta?.changes ?? 0) > 0
}
