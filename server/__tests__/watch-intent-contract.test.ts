import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { env } from 'cloudflare:test'
import { prepareWatchIntentUpsert } from '../contract/sql-contract.gen'

async function seed() {
  await env.HISTORY_DB.prepare(
    `CREATE TABLE IF NOT EXISTS WatchIntent (
      video_code TEXT PRIMARY KEY, href TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('want','viewed')),
      notes TEXT, status_at TEXT,
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    )`,
  ).run()
}

describe('ADR-055 generated WatchIntent upsert', () => {
  beforeAll(seed)
  beforeEach(async () => {
    await env.HISTORY_DB.prepare('DELETE FROM WatchIntent').run()
  })

  it('maps each column to the right value (bind order from the generator)', async () => {
    await prepareWatchIntentUpsert(env.HISTORY_DB, {
      videoCode: 'AAA-111',
      href: '/v/aaa',
      status: 'want',
      notes: 'mine',
    }).run()
    const row = await env.HISTORY_DB.prepare('SELECT * FROM WatchIntent WHERE video_code = ?')
      .bind('AAA-111')
      .first<{ video_code: string; href: string; status: string; notes: string | null }>()
    expect(row).toMatchObject({
      video_code: 'AAA-111',
      href: '/v/aaa',
      status: 'want',
      notes: 'mine',
    })
  })

  it('preserves notes when omitted on a status-only update (COALESCE)', async () => {
    await prepareWatchIntentUpsert(env.HISTORY_DB, {
      videoCode: 'AAA-111',
      href: '/v/aaa',
      status: 'want',
      notes: 'keep me',
    }).run()
    await prepareWatchIntentUpsert(env.HISTORY_DB, {
      videoCode: 'AAA-111',
      href: '/v/aaa',
      status: 'viewed',
      notes: null,
    }).run()
    const row = await env.HISTORY_DB.prepare(
      'SELECT status, notes FROM WatchIntent WHERE video_code = ?',
    )
      .bind('AAA-111')
      .first<{ status: string; notes: string | null }>()
    expect(row).toEqual({ status: 'viewed', notes: 'keep me' })
  })
})
