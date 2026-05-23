import type { Page } from '@playwright/test'

// ── Operations: qBittorrent ────────────────────────────────────────
export async function mockQbTorrents(page: Page): Promise<void> {
  await page.route('**/api/ops/qb/torrents', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          {
            hash: 'aaa111',
            name: 'E2E-Test-Torrent-Alpha',
            size: 2147483648,
            progress: 1.0,
            state: 'completed',
            category: 'Daily Ingestion',
            added_on: 1716192000,
            completion_on: 1716192000,
          },
          {
            hash: 'bbb222',
            name: 'E2E-Test-Torrent-Beta',
            size: 52428800,
            progress: 0.75,
            state: 'downloading',
            category: 'Ad Hoc',
            added_on: 1716278400,
            completion_on: 0,
          },
        ],
        total: 2,
      }),
    })
  })
}

export async function mockQbFilterSmall(page: Page): Promise<void> {
  await page.route('**/api/ops/qb/filter-small', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        dry_run: true,
        affected: 1,
        files: [{ name: 'small-file.mp4', size: 10485760, torrent: 'E2E-Test-Torrent-Beta' }],
      }),
    })
  })
}

// ── Operations: PikPak ─────────────────────────────────────────────
export async function mockPikPakQueue(page: Page): Promise<void> {
  await page.route('**/api/ops/pikpak/queue*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          {
            id: 1,
            torrent_name: 'E2E-PikPak-Item',
            torrent_hash: 'abc123',
            category: 'Daily Ingestion',
            transfer_status: 'pending',
            error_message: null,
            datetime_added_to_qb: '2026-05-20T12:00:00Z',
          },
        ],
        total: 1,
      }),
    })
  })
}

export async function mockPikPakTransfer(page: Page): Promise<void> {
  await page.route('**/api/ops/pikpak/transfer', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ transferred: 1, errors: [] }),
    })
  })
}

// ── Operations: Rclone ─────────────────────────────────────────────
export async function mockRcloneLast(page: Page): Promise<void> {
  await page.route('**/api/ops/rclone/last', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        inventory_count: 150,
        dedup_completed: 3,
        dedup_pending: 0,
        last_scan_time: '2026-05-20T08:00:00Z',
        total_freed_bytes: 5368709120,
      }),
    })
  })
}

export async function mockRcloneRun(page: Page): Promise<void> {
  await page.route('**/api/ops/rclone/run', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ started: true, dry_run: true }),
    })
  })
}

// ── Operations: Email ──────────────────────────────────────────────
export async function mockEmailHistory(page: Page): Promise<void> {
  await page.route('**/api/ops/email/history*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          {
            id: 1,
            subject: 'Daily Ingestion Report',
            recipient: 'ted@wu.engineer',
            status: 'sent',
            sent_at: '2026-05-20T09:00:00Z',
            error: null,
          },
        ],
        total: 1,
        cursor: null,
      }),
    })
  })
}

export async function mockEmailTest(page: Page): Promise<void> {
  await page.route('**/api/ops/email/test', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, message: 'Test email sent' }),
    })
  })
}

// ── Operations: Cleanup ────────────────────────────────────────────
export async function mockCleanupStaleSessions(page: Page): Promise<void> {
  await page.route('**/api/ops/cleanup/stale-sessions', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        dry_run: true,
        cleaned: 0,
        sessions: [],
      }),
    })
  })
}

export async function mockCleanupClaimStages(page: Page): Promise<void> {
  await page.route('**/api/ops/cleanup/claim-stages', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        dry_run: true,
        cleaned: 0,
        stages: [],
      }),
    })
  })
}

// ── Diagnostics: Health ────────────────────────────────────────────
export async function mockDeepHealthCheck(page: Page): Promise<void> {
  await page.route('**/api/health-check', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'healthy',
        subsystems: {
          database: { status: 'ok', latency_ms: 2 },
          qbittorrent: { status: 'ok', latency_ms: 45 },
          proxy_pool: { status: 'ok', active: 3 },
        },
      }),
    })
  })
}

// ── Diagnostics: JavDB Session ─────────────────────────────────────
export async function mockJavdbSession(page: Page): Promise<void> {
  await page.route('**/api/diag/javdb-session', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          cookie_present: true,
          cookie_value_preview: '_jdb_session=abc...xyz',
          last_refresh_time: '2026-05-20T10:00:00Z',
          estimated_expiry: '2026-06-20T10:00:00Z',
          is_likely_valid: true,
        }),
      })
    } else {
      await route.continue()
    }
  })
}

// ── Diagnostics: Parse ─────────────────────────────────────────────
export async function mockParseEndpoints(page: Page): Promise<void> {
  for (const type of ['index', 'detail', 'category', 'top', 'tags']) {
    await page.route(`**/api/parse/${type}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          page_type: type,
          movies: [{ code: 'PARSE-001', title: 'Parse test result', href: 'https://javdb.com/v/test' }],
        }),
      })
    })
  }
  await page.route('**/api/detect-page-type', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ page_type: 'index' }),
    })
  })
}

// ── GitHub Actions ─────────────────────────────────────────────────
export async function mockGhActionsWorkflows(page: Page): Promise<void> {
  await page.route('**/api/gh-actions/workflows', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        workflows: [
          {
            id: 1,
            name: 'DailyIngestion',
            state: 'active',
            last_run: {
              id: 100,
              name: 'DailyIngestion',
              status: 'completed',
              conclusion: 'success',
              event: 'schedule',
              created_at: '2026-05-20T00:00:00Z',
              run_number: 42,
            },
          },
          {
            id: 2,
            name: 'WeeklyDedup',
            state: 'active',
            last_run: null,
          },
        ],
      }),
    })
  })
}

export async function mockGhActionsRuns(page: Page): Promise<void> {
  await page.route('**/api/gh-actions/runs*', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          runs: [
            {
              id: 100,
              name: 'DailyIngestion',
              display_title: 'Daily run #42',
              status: 'completed',
              conclusion: 'success',
              event: 'schedule',
              created_at: '2026-05-20T00:00:00Z',
              run_number: 42,
            },
          ],
        }),
      })
    } else {
      await route.continue()
    }
  })
}

// ── Data: Movies + Torrents ────────────────────────────────────────
export async function mockHistoryMovies(page: Page): Promise<void> {
  await page.route('**/api/history/movies*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          {
            id: 1,
            video_code: 'ABC-001',
            href: 'https://javdb.com/v/test-1',
            actor_name: 'Test Actor',
            datetime_created: '2026-05-19T00:00:00Z',
            perfect_match: true,
            hi_res: false,
          },
        ],
        next_cursor: null,
        total_estimate: 1,
      }),
    })
  })
}

export async function mockHistoryTorrents(page: Page): Promise<void> {
  await page.route('**/api/history/torrents*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          {
            id: 1,
            movie_video_code: 'ABC-001',
            movie_href: 'https://javdb.com/v/test-1',
            magnet_uri: 'magnet:?xt=urn:btih:abc123',
            subtitle_indicator: 1,
            censor_indicator: 0,
            resolution_type: 1,
            size: '2.5GB',
            file_count: 3,
            datetime_created: '2026-05-19T00:00:00Z',
            session_id: null,
          },
        ],
        next_cursor: null,
        total_estimate: 1,
      }),
    })
  })
}

// ── Composite installers ───────────────────────────────────────────
export async function installOperationsMocks(page: Page): Promise<void> {
  await mockQbTorrents(page)
  await mockQbFilterSmall(page)
  await mockPikPakQueue(page)
  await mockPikPakTransfer(page)
  await mockRcloneLast(page)
  await mockRcloneRun(page)
  await mockEmailHistory(page)
  await mockEmailTest(page)
  await mockCleanupStaleSessions(page)
  await mockCleanupClaimStages(page)
}

export async function installDiagnosticsMocks(page: Page): Promise<void> {
  await mockDeepHealthCheck(page)
  await mockJavdbSession(page)
  await mockParseEndpoints(page)
}

export async function installGhActionsMocks(page: Page): Promise<void> {
  await mockGhActionsWorkflows(page)
  await mockGhActionsRuns(page)
}

export async function installDataMocks(page: Page): Promise<void> {
  await mockHistoryMovies(page)
  await mockHistoryTorrents(page)
}
