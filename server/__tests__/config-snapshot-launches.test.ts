import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { env } from 'cloudflare:test'
import { app } from '../app'
import { signJwt } from '../services/jwt'
import { createJobRunsRepo } from '../services/job-runs'
import migration from '../contracts/config_snapshots.sql?raw'

// Every Worker job-launch surface; inline javdb checks and unsupported smtp do not launch.
const launches = [
  ['/api/gh-actions/runs', { workflow: 'DailyIngestion.yml' }, 'DailyIngestion.yml'],
  ['/api/tasks/daily', {}, 'DailyIngestion.yml'],
  ['/api/tasks/adhoc', { url: 'https://javdb.com/actors/example' }, 'AdHocIngestion.yml'],
  ['/api/ops/qb/filter-small', {}, 'QBFileFilter.yml'],
  ['/api/ops/rclone/run', {}, 'RcloneManager.yml'],
  ['/api/ops/cleanup/stale-sessions', {}, 'StaleSessionCleanup.yml'],
  ['/api/sessions/sess-review/rollback', {}, 'RollbackD1.yml'],
  ['/api/onboarding/test', { component: 'qb' }, 'TestIngestion.yml'],
  ['/api/onboarding/test', { component: 'proxy' }, 'TestIngestion.yml'],
] as const
beforeEach(async () => {
  await env.OPERATIONS_DB.exec(migration.replace(/--[^\n]*/g, '').replace(/\n/g, ' '))
  await env.OPERATIONS_DB.prepare('DELETE FROM ConfigSnapshots').run()
  await createJobRunsRepo(env.OPERATIONS_DB).ensureTable()
  await env.OPERATIONS_DB.prepare('DELETE FROM job_runs').run()
  await env.OPERATIONS_DB.prepare(
    'CREATE TABLE IF NOT EXISTS api_config (key TEXT PRIMARY KEY, value TEXT)',
  ).run()
  await env.REPORTS_DB.prepare(
    'CREATE TABLE IF NOT EXISTS ReportSessions (Id TEXT PRIMARY KEY)',
  ).run()
  await env.REPORTS_DB.prepare("INSERT OR IGNORE INTO ReportSessions VALUES ('sess-review')").run()
})
afterEach(() => vi.restoreAllMocks())
for (const unavailable of [false, true]) {
  it.each(launches)(
    `%s allocates and captures before dispatch (unavailable=${unavailable})`,
    async (path, body, workflow) => {
      if (unavailable) await env.OPERATIONS_DB.prepare('DROP TABLE ConfigSnapshots').run()
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      const calls: string[] = []
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        const jobs = await env.OPERATIONS_DB.prepare('SELECT job_id FROM job_runs').all<{
          job_id: string
        }>()
        expect(jobs.results).toHaveLength(1)
        calls.push(jobs.results[0].job_id)
        if (!unavailable) {
          const rows = await env.OPERATIONS_DB.prepare(
            'SELECT consumer,status FROM ConfigSnapshots WHERE job_id = ? ORDER BY consumer',
          )
            .bind(calls[0])
            .all()
          expect(rows.results.map((r) => r.status)).toEqual([
            'captured',
            'unobservable',
            'unobservable',
          ])
        }
        expect(String(input)).toContain(
          `/repos/env-owner/env-repo/actions/workflows/${workflow}/dispatches`,
        )
        expect(new Headers(init?.headers).get('Authorization')).toContain('env-secret-canary')
        return new Response(null, { status: 204 })
      })
      const token = await signJwt(
        { sub: 'admin', role: 'admin', typ: 'access' },
        env.API_SECRET_KEY,
        60,
      )
      const response = await app.request(
        path,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'X-CSRF-Token': 'test',
            Cookie: 'csrf_token=test',
          },
          body: JSON.stringify(body),
        },
        {
          ...env,
          GH_ACTIONS_TIER: 'admin',
          GH_ACTIONS_TOKEN: 'env-secret-canary',
          GH_ACTIONS_REPO: 'env-owner/env-repo',
        },
      )
      const result = (await response.json()) as { job_id: string; config_snapshot_status: string }
      expect(response.status).toBeLessThan(300)
      expect(calls).toHaveLength(1)
      expect(result.job_id).toBe(calls[0])
      expect(result.config_snapshot_status).toBe(unavailable ? 'snapshot_unavailable' : 'captured')
      expect(JSON.stringify(result) + JSON.stringify(error.mock.calls)).not.toContain(
        'secret-canary',
      )
      if (unavailable) expect(JSON.stringify(error.mock.calls)).toContain('snapshot_unavailable')
    },
  )
}

it('does not copy arbitrary generic workflow secrets into new job tracking metadata', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, {status:204}))
  const token = await signJwt({sub:'admin',role:'admin',typ:'access'}, env.API_SECRET_KEY, 60)
  const response = await app.request('/api/gh-actions/runs', {method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','X-CSRF-Token':'test',Cookie:'csrf_token=test'},body:JSON.stringify({workflow:'PrivateWorkflow.yml',inputs:{credential:'input-secret-canary'}})},
    {...env,GH_ACTIONS_TIER:'admin',GH_ACTIONS_TOKEN:'env-secret-canary',GH_ACTIONS_REPO:'owner/repo'})
  expect(response.status).toBe(201)
  expect(String(fetch.mock.calls[0][1]?.body)).toContain('input-secret-canary')
  const rows = await env.OPERATIONS_DB.prepare('SELECT * FROM job_runs').all()
  expect(rows.results[0].inputs).toBeNull()
  const evidence = await env.OPERATIONS_DB.prepare('SELECT * FROM ConfigSnapshots').all()
  expect(JSON.stringify(rows.results)+JSON.stringify(evidence.results)+await response.text()).not.toContain('input-secret-canary')
})
