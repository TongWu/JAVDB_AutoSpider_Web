import { test, expect } from '@playwright/test'
import { loginViaUi, markOnboarded, resetBackend } from './fixtures/auth'
import { installDataMocks, installGhActionsMocks } from './fixtures/phase2-mocks'

test.describe('Phase 2: Data pages', () => {
  test.beforeEach(async ({ request, page }) => {
    await resetBackend(request)
    await markOnboarded(request, page)
    await installDataMocks(page)
  })

  test('Movies page loads and shows search results', async ({ page }) => {
    await loginViaUi(page)
    await page.goto('/data/movies')
    await expect(page.locator('h1')).toContainText(/movies/i, { timeout: 10_000 })

    // Mocked movie data should appear
    await expect(page.getByText('ABC-001')).toBeVisible({ timeout: 5_000 })
  })

  test('Torrents page loads and shows search results', async ({ page }) => {
    await loginViaUi(page)
    await page.goto('/data/torrents')
    await expect(page.locator('h1')).toContainText(/torrents/i, { timeout: 10_000 })

    // Mocked torrent data should appear
    await expect(page.getByText('ABC-001')).toBeVisible({ timeout: 5_000 })
  })
})

test.describe('Phase 2: GitHub Actions page', () => {
  test.beforeEach(async ({ request, page }) => {
    await resetBackend(request)
    await markOnboarded(request, page)
    await installGhActionsMocks(page)
  })

  test('Runs page loads and shows workflows', async ({ page }) => {
    await loginViaUi(page)
    await page.goto('/gh-actions')
    await expect(page.locator('h1')).toBeVisible({ timeout: 10_000 })

    // Mocked workflow data
    await expect(page.getByText('DailyIngestion')).toBeVisible({ timeout: 5_000 })
  })
})
