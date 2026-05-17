import { test, expect } from '@playwright/test'
import { loginViaUi, markOnboarded, resetBackend } from './fixtures/auth'

test.describe('Journey 3: Ad Hoc with Advanced spider options', () => {
  test.beforeEach(async ({ request }) => {
    await resetBackend(request)
    await markOnboarded(request)
  })

  test('submits an Ad Hoc job via Advanced mode with custom URL', async ({ page }) => {
    await loginViaUi(page)
    await page.goto('/run')

    // Switch to Ad Hoc tab
    await page.getByRole('tab', { name: /ad ?hoc/i }).click()

    // Fill URL
    await page.getByPlaceholder(/javdb.com\/actors/i).fill('https://javdb.com/actors/EvkJ')

    // Expand Advanced
    await page.getByText(/advanced.*spider options/i).click()

    // Activate advanced
    await page.getByRole('checkbox', { name: /use advanced/i }).check()

    // Enable dry-run for safety (find the dry-run switch — first switch in form)
    const dryRunSwitch = page.locator('.n-switch').first()
    await dryRunSwitch.click()

    // Submit
    await page.getByRole('button', { name: /^run$/i }).click()

    // RunCard appears
    await expect(
      page.locator('text=/Live|Done|pending|running|success|failed/i').first(),
    ).toBeVisible({ timeout: 15_000 })
  })
})
