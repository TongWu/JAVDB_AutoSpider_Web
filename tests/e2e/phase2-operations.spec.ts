import { test, expect } from '@playwright/test'
import { loginViaUi, markOnboarded, resetBackend } from './fixtures/auth'
import { installOperationsMocks } from './fixtures/phase2-mocks'

test.describe('Phase 2: Operations pages', () => {
  test.beforeEach(async ({ request, page }) => {
    await resetBackend(request)
    await markOnboarded(request)
    await installOperationsMocks(page)
  })

  test('qBittorrent page loads and shows torrent table', async ({ page }) => {
    await loginViaUi(page)
    await page.goto('/ops/qb')
    await expect(page.locator('h1')).toContainText(/qbittorrent/i, { timeout: 10_000 })

    await expect(page.getByText('E2E-Test-Torrent-Alpha')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText('E2E-Test-Torrent-Beta')).toBeVisible()
  })

  test('PikPak page loads and shows queue', async ({ page }) => {
    await loginViaUi(page)
    await page.goto('/ops/pikpak')
    await expect(page.locator('h1')).toContainText(/pikpak/i, { timeout: 10_000 })

    await expect(page.getByText('E2E-PikPak-Item')).toBeVisible({ timeout: 5_000 })
  })

  test('Rclone page loads and shows last scan', async ({ page }) => {
    await loginViaUi(page)
    await page.goto('/ops/rclone')
    await expect(page.locator('h1')).toContainText(/rclone/i, { timeout: 10_000 })

    // Mocked last scan data — inventory count shown
    await expect(page.getByText(/150/)).toBeVisible({ timeout: 5_000 })
  })

  test('Email page loads and shows history', async ({ page }) => {
    await loginViaUi(page)
    await page.goto('/ops/email')
    await expect(page.locator('h1')).toContainText(/email/i, { timeout: 10_000 })

    await expect(page.getByText('Daily Ingestion Report')).toBeVisible({ timeout: 5_000 })
  })

  test('Cleanup page loads and shows cleanup options', async ({ page }) => {
    await loginViaUi(page)
    await page.goto('/ops/cleanup')
    await expect(page.locator('h1')).toContainText(/cleanup/i, { timeout: 10_000 })

    // Should have a stale session cleanup section
    await expect(page.getByText(/stale session/i).first()).toBeVisible({ timeout: 5_000 })
  })
})
