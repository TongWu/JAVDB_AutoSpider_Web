import type { Page } from '@playwright/test'

export const COMMITTED_SESSION = {
  session_id: '20260517T120000.000000Z-0001-0001',
  state: 'committed',
  write_mode: 'audit',
  run_id: 'run-e2e-committed',
  run_attempt: 1,
  created_at: '2026-05-17T12:00:00Z',
}

export const FINALIZING_SESSION = {
  session_id: '20260517T130000.000000Z-0002-0001',
  state: 'finalizing',
  write_mode: 'audit',
  run_id: 'run-e2e-finalizing',
  run_attempt: 1,
  created_at: '2026-05-17T13:00:00Z',
}

export const SESSION_DETAIL = {
  session: COMMITTED_SESSION,
  movies: [
    { id: 1, title: 'E2E Movie One', code: 'E2E-001', href: 'https://javdb.com/v/e2e-1' },
    { id: 2, title: 'E2E Movie Two', code: 'E2E-002', href: 'https://javdb.com/v/e2e-2' },
  ],
  torrents: [
    { id: 1, name: 'e2e-movie-one.torrent', magnet: 'magnet:?xt=urn:btih:aaa', size: '2.1GB' },
  ],
}

export const ROLLBACK_DRY_RUN = {
  session_id: COMMITTED_SESSION.session_id,
  dry_run: true,
  actions: [
    { type: 'delete_movie', movie_id: 1, title: 'E2E Movie One' },
    { type: 'delete_torrent', torrent_id: 1, name: 'e2e-movie-one.torrent' },
  ],
  summary: { deletes: 2, updates: 0 },
}

export const ROLLBACK_APPLY = {
  session_id: COMMITTED_SESSION.session_id,
  dry_run: false,
  actions: ROLLBACK_DRY_RUN.actions,
  summary: ROLLBACK_DRY_RUN.summary,
}

export const COMMIT_RESULT = {
  session_id: FINALIZING_SESSION.session_id,
  new_state: 'committed',
  pending_dropped: 0,
}

export async function installSessionMocks(page: Page): Promise<void> {
  await page.route('**/api/sessions?**', async (route) => {
    const url = new URL(route.request().url())
    const stateFilter = url.searchParams.get('state')

    let items = [COMMITTED_SESSION, FINALIZING_SESSION]
    if (stateFilter === 'committed') items = [COMMITTED_SESSION]
    else if (stateFilter === 'finalizing') items = [FINALIZING_SESSION]

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items, next_cursor: null, total_estimate: items.length }),
    })
  })

  await page.route('**/api/sessions', async (route) => {
    if (route.request().url().includes('?')) return route.fallback()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [COMMITTED_SESSION, FINALIZING_SESSION],
        next_cursor: null,
        total_estimate: 2,
      }),
    })
  })

  await page.route('**/api/sessions/*/rollback', async (route) => {
    const body = route.request().postDataJSON() as { dry_run?: boolean } | null
    const isDryRun = body?.dry_run !== false
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(isDryRun ? ROLLBACK_DRY_RUN : ROLLBACK_APPLY),
    })
  })

  await page.route('**/api/sessions/*/commit', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(COMMIT_RESULT),
    })
  })

  await page.route(/\/api\/sessions\/[^/]+$/, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    const url = route.request().url()
    const isFinalizing = url.includes(encodeURIComponent(FINALIZING_SESSION.session_id))
      || url.includes(FINALIZING_SESSION.session_id)
    const session = isFinalizing ? FINALIZING_SESSION : COMMITTED_SESSION
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...SESSION_DETAIL, session }),
    })
  })
}
