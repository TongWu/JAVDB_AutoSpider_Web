import { test, expect } from '@playwright/test'
import { loginViaUi, resetBackend } from './fixtures/auth'

test.describe('Journey 1: First-run onboarding wizard', () => {
  test.beforeEach(async ({ request }) => {
    await resetBackend(request)
  })

  test('walks through all 5 steps and completes', async ({ page }) => {
    // After login on a fresh BE state, expect auto-redirect to /onboarding
    await loginViaUi(page)
    await expect(page).toHaveURL(/\/onboarding$/, { timeout: 10_000 })

    // Step 1 — Welcome
    await expect(page.getByText(/welcome to autospider/i)).toBeVisible()
    await page.getByRole('button', { name: /configure now/i }).click()

    // Step 2 — JavDB session: just skip
    await expect(page.getByText(/connect to javdb/i)).toBeVisible({ timeout: 5_000 })
    await page.getByRole('button', { name: /^skip$/i }).click()

    // Step 3 — qBittorrent: skip
    await expect(page.getByText(/connect qbittorrent/i)).toBeVisible({ timeout: 5_000 })
    await page.getByRole('button', { name: /^skip$/i }).click()

    // Step 4 — Proxy: mode None then continue
    await expect(page.getByText(/proxy configuration/i)).toBeVisible({ timeout: 5_000 })
    // Default mode is 'none' — just continue
    await page.getByRole('button', { name: /^continue$/i }).click()

    // Step 5 — First run: choose Skip and explore
    await expect(page.getByText(/try your first ingestion/i)).toBeVisible({ timeout: 5_000 })
    await page.getByRole('button', { name: /skip and explore/i }).click()

    // Should land on /
    await expect(page).toHaveURL(/\/(?:$|\?)/, { timeout: 10_000 })
  })
})
