import { test, expect } from '@playwright/test'
import { loginViaUi, resetBackend } from './fixtures/auth'

test.describe('Journey 1: First-run onboarding wizard', () => {
  test.beforeEach(async ({ request, page }) => {
    await resetBackend(request)
    // Force CapabilitiesGate to treat this run as un-onboarded. The BE reset
    // above DELETEs the `onboarded` row, but the CI BE's connection pool can
    // still return a cached value to the read served by /api/onboarding/status,
    // leaving the gate convinced the user is already done. Authoritative
    // browser-side mock avoids that race.
    await page.route('**/api/onboarding/status', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          completed: false,
          required_missing: ['javdb_session', 'qb'],
          skippable_missing: ['smtp', 'pikpak', 'rclone', 'proxy'],
        }),
      }),
    )
  })

  test('walks through all 5 steps and completes', async ({ page }) => {
    // This is a 6-hop journey (redirect + 5 wizard steps). On the slowest engine
    // (webkit) with a cold preview server, the per-hop auto-retry budgets can sum
    // past Playwright's default 30s per-test cap, which aborts the test mid-wizard
    // — the observed flake, whose failure point drifted between hops across runs.
    // Give the whole journey headroom; every hop below is still an auto-retrying
    // assertion (returns as soon as the condition holds), so this adds no fixed
    // wait — only a larger ceiling for a genuinely slow engine.
    test.setTimeout(120_000)
    const STEP_TIMEOUT = 15_000

    // After login on a fresh BE state, expect auto-redirect to /onboarding.
    // The redirect is async: CapabilitiesGate.boot() fetches capabilities + health,
    // then fetches onboarding status, then redirects.
    await loginViaUi(page)
    await expect(page).toHaveURL(/\/onboarding$/, { timeout: 45_000 })

    // Step 1 — Welcome
    await expect(page.getByText(/welcome to autospider/i)).toBeVisible({ timeout: STEP_TIMEOUT })
    await page.getByRole('button', { name: /configure now/i }).click()

    // Step 2 — JavDB session: just skip
    await expect(page.getByText(/connect to javdb/i)).toBeVisible({ timeout: STEP_TIMEOUT })
    await page.getByRole('button', { name: /^skip$/i }).click()

    // Step 3 — qBittorrent: skip
    await expect(page.getByText(/connect qbittorrent/i)).toBeVisible({ timeout: STEP_TIMEOUT })
    await page.getByRole('button', { name: /^skip$/i }).click()

    // Step 4 — Proxy: select None (config may pre-populate Pool) then continue
    await expect(page.getByText(/proxy configuration/i)).toBeVisible({ timeout: STEP_TIMEOUT })
    await page.getByText('None', { exact: true }).click()
    await page.getByRole('button', { name: /^continue$/i }).click()

    // Step 5 — First run: choose Skip and explore
    await expect(page.getByText(/try your first ingestion/i)).toBeVisible({ timeout: STEP_TIMEOUT })
    await page.getByRole('button', { name: /skip and explore/i }).click()

    // Should land on /
    await expect(page).toHaveURL(/\/(?:$|\?)/, { timeout: STEP_TIMEOUT })
  })
})
