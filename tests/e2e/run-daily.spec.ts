import { test, expect } from '@playwright/test'
import { loginViaUi, markOnboarded, resetBackend } from './fixtures/auth'

test.describe('Journey 2: Login → Run Daily → see log stream', () => {
  test.beforeEach(async ({ request }) => {
    await resetBackend(request)
    await markOnboarded(request)
  })

  test('triggers a Daily run with dry-run and sees RunCard appear', async ({ page }) => {
    await loginViaUi(page)

    // Skip onboarding by navigating directly (since BE is marked onboarded)
    await page.goto('/run')
    await expect(page.getByRole('heading', { name: /run/i })).toBeVisible({ timeout: 10_000 })

    // Should be on Daily tab by default. Toggle dry-run on so the run is harmless.
    const dryRunToggle = page.locator('.n-switch').first()
    await dryRunToggle.click()

    // Click "Run"
    await page.getByRole('button', { name: /^run$/i }).click()

    // RunCard should appear within 10s (BE has to respond with job_id)
    // The job id is mono-styled; we can match on the "Live" or "Done" status tag instead.
    await expect(
      page.locator('text=/Live|Done|pending|running|success/i').first(),
    ).toBeVisible({ timeout: 15_000 })

    // The log viewer should be present (filter input is a stable anchor)
    await expect(page.locator('input[placeholder*="Filter"]')).toBeVisible()
  })
})
