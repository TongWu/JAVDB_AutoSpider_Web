import type { Page } from '@playwright/test'
import { installGhActionsMocks } from './phase2-mocks'

// ── Workflow Editor ────────────────────────────────────────────────
export async function mockWorkflowContent(page: Page): Promise<void> {
  await page.route('**/api/gh-actions/workflows/*', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          content:
            "name: DailyIngestion\non:\n  schedule:\n    - cron: '0 2 * * *'\njobs:\n  ingest:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n",
          sha: 'abc123sha',
          path: '.github/workflows/DailyIngestion.yml',
        }),
      })
    } else {
      await route.continue()
    }
  })
}

// ── Secrets ────────────────────────────────────────────────────────
export async function mockSecrets(page: Page): Promise<void> {
  await page.route('**/api/gh-actions/secrets', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          secrets: [
            {
              name: 'GH_TOKEN',
              created_at: '2026-05-01T00:00:00Z',
              updated_at: '2026-05-20T00:00:00Z',
            },
            {
              name: 'D1_API_TOKEN',
              created_at: '2026-05-01T00:00:00Z',
              updated_at: '2026-05-15T00:00:00Z',
            },
          ],
        }),
      })
    } else if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ created: true }),
      })
    } else {
      await route.continue()
    }
  })
}

// mockSecretCreate is intentionally a no-op: POST is handled inside mockSecrets
// to avoid double-registration on the same URL pattern.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function mockSecretCreate(page: Page): Promise<void> {
  // GET + POST for **/api/gh-actions/secrets are both handled by mockSecrets.
}

export async function mockSecretDelete(page: Page): Promise<void> {
  await page.route('**/api/gh-actions/secrets/*', async (route) => {
    if (route.request().method() === 'DELETE') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ deleted: true }),
      })
    } else {
      await route.continue()
    }
  })
}

// ── Migrations ─────────────────────────────────────────────────────
export async function mockMigrations(page: Page): Promise<void> {
  await page.route('**/api/migrations/', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        migrations: [
          {
            id: '001',
            filename: '001_initial_schema.sql',
            applied: true,
            applied_at: '2026-05-01T00:00:00Z',
          },
          {
            id: '002',
            filename: '002_add_indexes.sql',
            applied: true,
            applied_at: '2026-05-10T00:00:00Z',
          },
          {
            id: '003',
            filename: '003_add_operations.sql',
            applied: false,
            applied_at: null,
          },
        ],
      }),
    })
  })
}

export async function mockMigrationRun(page: Page): Promise<void> {
  await page.route('**/api/migrations/*/run', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          migration_id: '003',
          dry_run: true,
          sql_preview: 'CREATE TABLE operations (\n  id INTEGER PRIMARY KEY,\n  name TEXT NOT NULL\n);',
          statements: 1,
        }),
      })
    } else {
      await route.continue()
    }
  })
}

// ── Log Search ─────────────────────────────────────────────────────
export async function mockLogSearch(page: Page): Promise<void> {
  await page.route('**/api/logs/search*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        results: [
          {
            job_id: 'job-abc-001',
            line_number: 42,
            text: 'Processing movie ABC-123 from page 1',
            kind: 'spider',
            created_at: '2026-05-20T02:15:00Z',
          },
          {
            job_id: 'job-abc-001',
            line_number: 87,
            text: 'Spider completed: 15 movies found',
            kind: 'spider',
            created_at: '2026-05-20T02:18:00Z',
          },
        ],
        total_matched: 2,
        truncated: false,
      }),
    })
  })
}

// ── Stats ──────────────────────────────────────────────────────────
export async function mockStatsSummary(page: Page): Promise<void> {
  await page.route('**/api/stats/summary', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        total_runs: 142,
        success_rate: 0.95,
        avg_duration_seconds: 185,
        total_movies: 8750,
        total_torrents: 23400,
        total_pikpak: 1200,
        total_dedup_freed_bytes: 53687091200,
        proxy_bans_last_7d: 3,
      }),
    })
  })
}

export async function mockStatsTrend(page: Page): Promise<void> {
  await page.route('**/api/stats/trend*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        metric: 'runs',
        period: '30d',
        data_points: [
          { date: '2026-04-25', value: 5 },
          { date: '2026-05-01', value: 7 },
          { date: '2026-05-08', value: 4 },
          { date: '2026-05-15', value: 6 },
        ],
      }),
    })
  })
}

// ── Capabilities (admin tier for power-user pages) ─────────────────
export async function mockCapabilitiesAdmin(page: Page): Promise<void> {
  await page.route('**/api/capabilities', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        version: '2.0.0',
        ingestion_mode: 'local',
        gh_actions: { tier: 'admin', repo: 'tedwu/javdb-autospider', token_configured: true },
        storage_backend: 'sqlite',
        // Power-user mock: enable the library ownership/consumption tab gates
        // (ADR-034) so flows that open those tabs keep working.
        features: { library_ownership: true, library_consumption: true },
        deployment: 'colocated',
        build: { frontend_version: '0.1.0', backend_version: '2.0.0', git_sha: 'e2e' },
      }),
    })
  })
}

// ── Composite installer ────────────────────────────────────────────
export async function installPhase3Mocks(page: Page): Promise<void> {
  await mockCapabilitiesAdmin(page)
  await installGhActionsMocks(page)
  await mockWorkflowContent(page)
  await mockSecrets(page)
  await mockSecretCreate(page)
  await mockSecretDelete(page)
  await mockMigrations(page)
  await mockMigrationRun(page)
  await mockLogSearch(page)
  await mockStatsSummary(page)
  await mockStatsTrend(page)
}
