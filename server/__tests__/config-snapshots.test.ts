import { beforeEach, describe, expect, it, vi } from 'vitest'
import { env } from 'cloudflare:test'
import { app } from '../app'
import { signJwt } from '../services/jwt'
import worker from '../worker'
import * as snapshots from '../services/config-snapshots'
import migration from '../contracts/config_snapshots.sql?raw'
import golden from '../contracts/config_snapshot_golden.json'

beforeEach(async () => {
  await env.OPERATIONS_DB.exec(migration.replace(/--[^\n]*/g, '').replace(/\n/g, ' '))
  await env.OPERATIONS_DB.prepare('DELETE FROM ConfigSnapshots').run()
  await env.OPERATIONS_DB.prepare(
    'CREATE TABLE IF NOT EXISTS api_config (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)',
  ).run()
  await env.OPERATIONS_DB.prepare('DELETE FROM api_config').run()
})

describe('ADR-061 evidence', () => {
  it('matches the shared redacted canonical digest', async () => {
    const fields = golden.inputs.map((f) => snapshots.redactField(f.key, f.value, f.source))
    const snapshot = snapshots.buildSnapshot('api_process', fields, golden.snapshot.captured_at)
    expect(snapshot).toEqual(golden.snapshot)
    expect(snapshots.canonicalJson(snapshot)).toBe(golden.canonical)
    expect(await snapshots.digestSnapshot(snapshot)).toBe(golden.digest)
  })

  it('never emits credentials, arbitrary JSON or unsafe scalar values', () => {
    for (const key of [
      'API_SECRET_KEY',
      'ADMIN_PASSWORD_HASH',
      'JAVDB_SESSION_COOKIE',
      'PROXY_POOL',
      'PROXY_HTTP',
      'QB_URL',
      'CLOUDFLARE_API_TOKEN',
      'UNKNOWN_SETTING',
      'JAVDB_USERNAME',
    ]) {
      for (const value of ['secret-canary', { token: 'secret-canary' }, ['secret-canary']]) {
        const field = snapshots.redactField(key, value, 'config_module')
        expect(field).toEqual({ key, source: 'config_module', sensitive: true, present: true })
      }
    }
    expect(snapshots.redactField('PAGE_END', 7, 'default', true)).not.toHaveProperty('value')
    expect(snapshots.redactField('PAGE_END', NaN, 'default')).not.toHaveProperty('value')
    expect(snapshots.redactField('PAGE_END', 2 ** 54, 'default')).not.toHaveProperty('value')
    expect(snapshots.redactField('PAGE_END', 7, 'secret-canary').source).toBe('unknown')
  })

  it('rejects a changed capture while preserving original history', async () => {
    await env.OPERATIONS_DB.prepare('INSERT INTO api_config (key,value) VALUES (?,?)')
      .bind('PAGE_END', '7')
      .run()
    const first = await snapshots.captureDispatch(env, 'job-a')
    expect(first.consumers[0].status).toBe('captured')
    expect(first.consumers[1].status).toBe('unobservable')
    expect(first.consumers[2].status).toBe('unobservable')
    await env.OPERATIONS_DB.prepare('UPDATE api_config SET value = ? WHERE key = ?')
      .bind('99', 'PAGE_END')
      .run()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const second = await snapshots.captureDispatch(env, 'job-a')
    expect(
      second.consumers.every(
        (c) => c.status === 'snapshot_unavailable' && c.snapshot === null && c.digest === null,
      ),
    ).toBe(true)
    expect(error).toHaveBeenCalledWith('config_snapshot snapshot_unavailable')
    error.mockRestore()
    const history = await snapshots.readJobSnapshots(env.OPERATIONS_DB, 'job-a')
    expect(history).toEqual(first)
    await expect(
      env.OPERATIONS_DB.prepare("UPDATE ConfigSnapshots SET digest = 'bad'").run(),
    ).rejects.toThrow('immutable')
  })

  it('hides and deletes evidence at the exact 90-day boundary', async () => {
    await snapshots.insertSnapshot(
      env.OPERATIONS_DB,
      'job-old',
      golden.snapshot as snapshots.Snapshot,
    )
    const expires = Date.parse(golden.snapshot.captured_at) / 1000 + 90 * 86400
    expect(
      (await snapshots.readJobSnapshots(env.OPERATIONS_DB, 'job-old', expires - 1)).consumers[0]
        .status,
    ).toBe('captured')
    expect(
      (await snapshots.readJobSnapshots(env.OPERATIONS_DB, 'job-old', expires)).consumers[0].status,
    ).toBe('snapshot_unavailable')
    await snapshots.cleanupSnapshots(env.OPERATIONS_DB, expires)
    expect(
      (await snapshots.readJobSnapshots(env.OPERATIONS_DB, 'job-old', expires - 1)).consumers[0]
        .status,
    ).toBe('snapshot_unavailable')
  })

  it('reports D1 failure without throwing or logging exception contents', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const badEnv = {
      ...env,
      OPERATIONS_DB: {
        prepare() {
          throw new Error('secret-canary')
        },
      } as unknown as D1Database,
    }
    const result = await snapshots.captureDispatch(badEnv, 'job-a')
    expect(result.consumers[0].status).toBe('snapshot_unavailable')
    expect(result.consumers[0].digest).toBeNull()
    expect(JSON.stringify(error.mock.calls)).not.toContain('secret-canary')
    expect(JSON.stringify(error.mock.calls)).toContain('snapshot_unavailable')
    error.mockRestore()
  })

  it('requires authentication and admin access for both read surfaces', async () => {
    expect((await app.request('/api/config/consumers', {}, env)).status).toBe(401)
    const reader = await signJwt(
      { sub: 'reader', role: 'readonly', typ: 'access' },
      env.API_SECRET_KEY,
      60,
    )
    for (const path of ['/api/config/consumers', '/api/config/job-snapshots/job-a']) {
      expect(
        (await app.request(path, { headers: { Authorization: `Bearer ${reader}` } }, env)).status,
      ).toBe(403)
    }
    const login = await app.request(
      '/api/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'testpassword123' }),
      },
      env,
    )
    const { access_token } = (await login.json()) as { access_token: string }
    const headers = { Authorization: `Bearer ${access_token}` }
    const live = await app.request('/api/config/consumers', { headers }, env)
    expect(live.status).toBe(200)
    const body = (await live.json()) as snapshots.Envelope
    expect(body.consumers.map((c) => c.status)).toEqual([
      'observed',
      'unobservable',
      'unobservable',
    ])
    const history = await app.request('/api/config/job-snapshots/job-missing', { headers }, env)
    expect(history.status).toBe(200)
    expect(
      ((await history.json()) as snapshots.Envelope).consumers.every(
        (c) => c.status === 'snapshot_unavailable',
      ),
    ).toBe(true)
    expect(
      (await app.request('/api/config/job-snapshots/not%20valid', { headers }, env)).status,
    ).toBe(422)
  })
})

it('scheduled cleanup runs without request traffic and surfaces sanitized failure', async () => {
  await snapshots.insertSnapshot(env.OPERATIONS_DB, 'job-expired', {
    ...golden.snapshot,
    captured_at: '2020-01-01T00:00:00.000Z',
  } as snapshots.Snapshot)
  await worker.scheduled({} as ScheduledController, env)
  expect(
    (
      await env.OPERATIONS_DB.prepare('SELECT COUNT(*) AS n FROM ConfigSnapshots').first<{
        n: number
      }>()
    )?.n,
  ).toBe(0)
})

it('a missing acknowledgement read alerts instead of silently downgrading', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  let allReads = 0
  const db = {
    prepare(sql: string) {
      const statement = env.OPERATIONS_DB.prepare(sql)
      return {
        bind(...args: unknown[]) {
          const bound = statement.bind(...args)
          if (sql.includes('expires_at >'))
            return {
              all: async () => {
                allReads++
                throw new Error('secret-canary')
              },
            }
          return bound
        },
        all: () => statement.all(),
      }
    },
  } as unknown as D1Database
  const result = await snapshots.captureDispatch({ ...env, OPERATIONS_DB: db }, 'job-no-read')
  expect(allReads).toBe(1)
  expect(result.consumers[0].status).toBe('snapshot_unavailable')
  expect(JSON.stringify(error.mock.calls)).toContain('snapshot_unavailable')
  expect(JSON.stringify(error.mock.calls)).not.toContain('secret-canary')
  error.mockRestore()
})

it('job creation remains dispatched when snapshot storage fails', async () => {
  const { createJobRunsRepo } = await import('../services/job-runs')
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  const badEnv = {
    ...env,
    OPERATIONS_DB: {
      prepare() {
        throw new Error('secret-canary')
      },
    } as unknown as D1Database,
  }
  const repo = createJobRunsRepo(env.OPERATIONS_DB, badEnv)
  await repo.ensureTable()
  const job = await repo.create('daily', 'DailyIngestion.yml')
  expect(job.status).toBe('dispatched')
  expect((await repo.get(job.job_id))?.status).toBe('dispatched')
  expect(JSON.stringify(error.mock.calls)).toContain('snapshot_unavailable')
  expect(JSON.stringify(error.mock.calls)).not.toContain('secret-canary')
  error.mockRestore()
})

it('observes actual dispatch bindings even when D1 disagrees', async () => {
  for (const key of ['GH_ACTIONS_TIER', 'GH_ACTIONS_TOKEN', 'GH_ACTIONS_REPO']) {
    await env.OPERATIONS_DB.prepare('INSERT INTO api_config (key,value) VALUES (?,?)')
      .bind(key, JSON.stringify('d1-secret-canary'))
      .run()
  }
  for (const bindings of [
    {
      GH_ACTIONS_TIER: 'admin',
      GH_ACTIONS_TOKEN: 'env-secret-canary',
      GH_ACTIONS_REPO: 'owner/repo',
    },
    { GH_ACTIONS_TIER: undefined, GH_ACTIONS_TOKEN: undefined, GH_ACTIONS_REPO: undefined },
  ]) {
    const result = await snapshots.currentConsumers({ ...env, ...bindings })
    const fields = result.consumers[0].snapshot!.fields
    for (const key of ['GH_ACTIONS_TIER', 'GH_ACTIONS_TOKEN', 'GH_ACTIONS_REPO'] as const) {
      expect(fields.find((f) => f.key === key)).toEqual({
        key,
        source: 'environment',
        present: !!bindings[key],
        sensitive: true,
      })
    }
    expect(JSON.stringify(result)).not.toContain('secret-canary')
  }
})

it.each(['reason', 'status', 'snapshot_json', 'digest'])(
  'rejects secret-canary in untrusted %s before the admin API',
  async (column) => {
    const row = {
      consumer: 'api_process',
      status: 'captured',
      reason: null,
      snapshot_json: JSON.stringify(golden.snapshot),
      digest: golden.digest,
      [column]: 'secret-canary',
    }
    const db = {
      prepare: () => ({ bind: () => ({ all: async () => ({ success: true, results: [row] }) }) }),
    } as unknown as D1Database
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const token = await signJwt(
      { sub: 'admin', role: 'admin', typ: 'access' },
      env.API_SECRET_KEY,
      60,
    )
    const response = await app.request(
      '/api/config/job-snapshots/job-a',
      { headers: { Authorization: `Bearer ${token}` } },
      { ...env, OPERATIONS_DB: db },
    )
    const body = (await response.json()) as snapshots.Envelope
    expect(body.consumers[0].status).toBe('snapshot_unavailable')
    expect(body.consumers[0].reason).toBe('invalid_evidence')
    expect(JSON.stringify(body) + JSON.stringify(error.mock.calls)).not.toContain('secret-canary')
    error.mockRestore()
  },
)

it.each([
  ['captured', 'secret-canary'],
  ['unobservable', 'secret-canary'],
  ['unobservable', null],
])('SQL rejects %s with reason %s', async (status, reason) => {
  await expect(
    env.OPERATIONS_DB.prepare('INSERT INTO ConfigSnapshots VALUES (?,?,?,?,?,?,?,?)')
      .bind(
        'bad',
        'api_process',
        golden.snapshot.captured_at,
        2000000000,
        status,
        reason,
        status === 'captured' ? '{}' : null,
        status === 'captured' ? 'bad' : null,
      )
      .run(),
  ).rejects.toThrow()
})

it('does not trust an unredacted payload even with a matching digest', async () => {
  const snapshot = snapshots.buildSnapshot('api_process', [])
  snapshot.fields = [
    {
      key: 'QB_PASSWORD',
      source: 'environment',
      sensitive: false,
      present: true,
      value: 'secret-canary',
    },
  ]
  const row = {
    consumer: 'api_process',
    status: 'captured',
    reason: null,
    snapshot_json: JSON.stringify(snapshot),
    digest: await snapshots.digestSnapshot(snapshot),
  }
  const db = {
    prepare: () => ({ bind: () => ({ all: async () => ({ success: true, results: [row] }) }) }),
  } as unknown as D1Database
  const result = await snapshots.readJobSnapshots(db, 'job-a')
  expect(result.consumers[0].reason).toBe('invalid_evidence')
  expect(JSON.stringify(result)).not.toContain('secret-canary')
})

it('acknowledges identical redacted replay without refreshing expiry', async () => {
  const snapshot = golden.snapshot as snapshots.Snapshot
  const first = await snapshots.insertSnapshot(env.OPERATIONS_DB, 'job-replay', snapshot)
  const before = await env.OPERATIONS_DB.prepare('SELECT * FROM ConfigSnapshots').all()
  expect(await snapshots.insertSnapshot(env.OPERATIONS_DB, 'job-replay', snapshot)).toEqual(first)
  expect((await env.OPERATIONS_DB.prepare('SELECT * FROM ConfigSnapshots').all()).results).toEqual(
    before.results,
  )
})

it.each(['value', 'source', 'timestamp', 'unobservable'])(
  'rejects nonidentical %s replay with no payload or digest',
  async (change) => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const snapshot = snapshots.buildSnapshot(
      'api_process',
      [
        snapshots.redactField('PAGE_END', 7, 'default'),
        snapshots.redactField('QB_PASSWORD', 'secret-canary', 'default'),
      ],
      golden.snapshot.captured_at,
    )
    if (change === 'unobservable') {
      await env.OPERATIONS_DB.prepare(
        `INSERT INTO ConfigSnapshots VALUES
        ('job-replay','api_process',?,?,'unobservable','not_observed_in_this_process',NULL,NULL)`,
      )
        .bind(snapshot.captured_at, Date.parse(snapshot.captured_at) / 1000 + 90 * 86400)
        .run()
    } else {
      await snapshots.insertSnapshot(env.OPERATIONS_DB, 'job-replay', snapshot)
    }
    const before = await env.OPERATIONS_DB.prepare('SELECT * FROM ConfigSnapshots').all()
    const field = snapshot.fields.find((f) => f.key === 'PAGE_END')!
    if (change === 'value') field.value = 99
    if (change === 'source') field.source = 'override_store'
    if (change === 'timestamp') snapshot.captured_at = '2026-09-22T00:00:01.000Z'
    const result = await snapshots.insertSnapshot(env.OPERATIONS_DB, 'job-replay', snapshot)
    expect(result).toEqual({
      consumer: 'api_process',
      status: 'snapshot_unavailable',
      reason: 'invalid_evidence',
      snapshot: null,
      digest: null,
    })
    expect(
      (await env.OPERATIONS_DB.prepare('SELECT * FROM ConfigSnapshots').all()).results,
    ).toEqual(before.results)
    expect(JSON.stringify(result) + JSON.stringify(error.mock.calls)).not.toContain('secret-canary')
    error.mockRestore()
  },
)

it('rejects captured remote evidence where dispatch attempted unobservable', async () => {
  // Freeze observation time so only the remote status mismatch causes failure.
  vi.useFakeTimers()
  vi.setSystemTime(new Date(golden.snapshot.captured_at))
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    const remote = snapshots.buildSnapshot('cli_accessor', [
      snapshots.redactField('QB_PASSWORD', 'secret-canary', 'default'),
    ])
    await snapshots.insertSnapshot(env.OPERATIONS_DB, 'job-remote-conflict', remote)
    const result = await snapshots.captureDispatch(env, 'job-remote-conflict')
    expect(
      result.consumers.every(
        (c) => c.status === 'snapshot_unavailable' && c.snapshot === null && c.digest === null,
      ),
    ).toBe(true)
    expect(error).toHaveBeenCalledWith('config_snapshot snapshot_unavailable')
    expect(JSON.stringify(result) + JSON.stringify(error.mock.calls)).not.toContain('secret-canary')
    const history = await snapshots.readJobSnapshots(env.OPERATIONS_DB, 'job-remote-conflict')
    expect(history.consumers[1].snapshot).toEqual(remote)
  } finally {
    error.mockRestore()
    vi.useRealTimers()
  }
})

it('acknowledges identical dispatch replay including unobservable consumers', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(golden.snapshot.captured_at))
  try {
    const first = await snapshots.captureDispatch(env, 'job-identical')
    expect(first.consumers.map((c) => c.status)).toEqual([
      'captured',
      'unobservable',
      'unobservable',
    ])
    expect(await snapshots.captureDispatch(env, 'job-identical')).toEqual(first)
  } finally {
    vi.useRealTimers()
  }
})
