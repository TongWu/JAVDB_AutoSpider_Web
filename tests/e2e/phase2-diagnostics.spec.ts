import { test, expect } from '@playwright/test'
import { loginViaUi, markOnboarded, resetBackend } from './fixtures/auth'
import { installDiagnosticsMocks } from './fixtures/phase2-mocks'

test.describe('Phase 2: Diagnostics pages', () => {
  test.beforeEach(async ({ request, page }) => {
    await resetBackend(request)
    await markOnboarded(request, page)
    await installDiagnosticsMocks(page)
  })

  test('Health page loads and shows health status', async ({ page }) => {
    await loginViaUi(page)
    await page.goto('/diag/health')
    await expect(page.locator('h1')).toContainText(/health/i, { timeout: 10_000 })
  })

  test('Parse Tester page loads and shows parse form', async ({ page }) => {
    await loginViaUi(page)
    await page.goto('/diag/parse')
    await expect(page.locator('h1')).toContainText(/parse tester/i, { timeout: 10_000 })

    // Should have a textarea for HTML input
    await expect(page.locator('textarea').first()).toBeVisible({ timeout: 5_000 })
  })

  test('JavDB Session page loads and shows session status', async ({ page }) => {
    await loginViaUi(page)
    await page.goto('/diag/javdb')
    await expect(page.locator('h1')).toContainText(/javdb session/i, { timeout: 10_000 })

    // Mocked session data shows cookie preview
    await expect(page.getByText(/_jdb_session/i).first()).toBeVisible({ timeout: 5_000 })
  })
})
