import { test, expect } from '@playwright/test'
import { loginViaUi, markOnboarded, resetBackend } from './fixtures/auth'

test.describe('Journey 8: Backend down → outage screen → recovers', () => {
  test.beforeEach(async ({ request, page }) => {
    await resetBackend(request)
    await markOnboarded(request, page)
  })

  test('shows outage screen when health fails, recovers on retry', async ({ page }) => {
    // Login first (health gate only activates for authenticated users)
    await loginViaUi(page)

    // Now intercept health to simulate backend going down
    await page.route('**/api/health', (route) =>
      route.fulfill({ status: 503, body: 'Service Unavailable' }),
    )
    // Let capabilities through so the outage branch triggers (not the error page)
    await page.route('**/api/capabilities', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          version: '2.0.0',
          ingestion_mode: 'local',
          gh_actions: { tier: 'none', repo: null, token_configured: false },
          storage_backend: 'sqlite',
          features: {},
          deployment: 'colocated',
          build: { frontend_version: '0.1.0', backend_version: '2.0.0', git_sha: 'e2e' },
        }),
      }),
    )

    // Navigate to home to trigger the boot gate
    await page.goto('/')

    // OutageScreen should render
    await expect(page.locator('text=/Cannot reach backend|无法连接/i').first()).toBeVisible({
      timeout: 10_000,
    })

    // Retry button with countdown is visible
    const retryBtn = page.getByRole('button', { name: /retry/i })
    await expect(retryBtn).toBeVisible()

    // Now unblock health — simulate backend recovery
    await page.unroute('**/api/health')
    await page.unroute('**/api/capabilities')

    // Click retry
    await retryBtn.click()

    // App should recover — home page content or heading visible
    await expect(
      page.locator('text=/healthy|Dashboard|仪表盘|ダッシュボード/i').first(),
    ).toBeVisible({ timeout: 15_000 })
  })
})
