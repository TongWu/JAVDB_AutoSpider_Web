import { test, expect } from '@playwright/test'
import { loginViaUi, markOnboarded, resetBackend } from './fixtures/auth'

const SEED_INCIDENT = {
  incident_id: 'opsinc_test',
  trigger_source: 'gh_run',
  run_id: '12345',
  run_attempt: 1,
  session_id: '20260601T120000.000000Z-0001-0001',
  incident_type: 'failed_ingestion',
  status: 'open',
  persistence_status: 'persisted',
  model_version: 'v1',
  detector_version: 'v1',
  confidence: 'low',
  confirmed_findings: ['Workflow result is failure.', 'No torrents extracted.'],
  likely_causes: ['Proxy exhausted.'],
  unknowns: [],
  recommended_next_actions: ['Check proxy pool.'],
  unsafe_actions: [],
  evidence_refs: [{ kind: 'gh_run', ref: '12345', label: 'Run #12345' }],
  created_at: '2026-06-01T12:00:00Z',
  updated_at: '2026-06-01T12:01:00Z',
  resolved_at: null,
}

const SEED_ANALYTICS = {
  total: 1,
  by_type: { failed_ingestion: 1 },
  by_status: { open: 1 },
  by_confidence: { low: 1 },
  open_high_confidence: 0,
}

test.describe('Ops Incidents diagnostics page', () => {
  test.beforeEach(async ({ request, page }) => {
    await resetBackend(request)
    await markOnboarded(request, page)

    // Mock the ops-incidents list endpoint
    await page.route('**/api/diag/ops-incidents/analytics', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(SEED_ANALYTICS),
      })
    })

    await page.route('**/api/diag/ops-incidents', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ items: [SEED_INCIDENT] }),
        })
      } else {
        await route.continue()
      }
    })
  })

  test('page loads and shows the seeded incident', async ({ page }) => {
    await loginViaUi(page)
    await page.goto('/diag/ops-incidents')

    // Page heading
    await expect(page.locator('h1')).toContainText(/ops incidents/i, { timeout: 10_000 })

    // run_id is rendered in the run_id column
    await expect(page.getByText('12345').first()).toBeVisible({ timeout: 5_000 })

    // Top finding is rendered in the top_finding column
    await expect(page.getByText('Workflow result is failure.').first()).toBeVisible({
      timeout: 5_000,
    })
  })

  test('opens detail drawer when row is clicked', async ({ page }) => {
    await loginViaUi(page)
    await page.goto('/diag/ops-incidents')

    // Wait for the top-finding column value to appear in the table
    await expect(page.getByText('Workflow result is failure.').first()).toBeVisible({
      timeout: 8_000,
    })

    // Click the top-finding cell to open the drawer
    await page.getByText('Workflow result is failure.').first().click()

    // Drawer title/content should show the incident_id
    await expect(page.getByText('opsinc_test').first()).toBeVisible({ timeout: 5_000 })
  })
})
