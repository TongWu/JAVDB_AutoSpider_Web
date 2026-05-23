import { test, expect } from '@playwright/test'
import { loginViaUi, markOnboarded, resetBackend } from './fixtures/auth'
import { installPhase3Mocks } from './fixtures/phase3-mocks'

test.describe('Phase 3: Power-user pages', () => {
  test.beforeEach(async ({ request }) => {
    await resetBackend(request)
    await markOnboarded(request)
  })

  // ── Journey 18: GH Actions workflow YAML editor ──────────────────
  test('Journey 18: workflow editor loads YAML and shows save controls', async ({ page }) => {
    await installPhase3Mocks(page)

    await loginViaUi(page)
    await page.goto('/gh-actions/workflows')
    await expect(page.locator('h1')).toContainText(/workflows/i, { timeout: 10_000 })

    // Wait for workflow list from phase2 mock (installPhase3Mocks includes GH Actions mocks)
    await expect(page.getByText('DailyIngestion').first()).toBeVisible({ timeout: 5_000 })

    // Click on DailyIngestion in the menu
    await page.getByText('DailyIngestion').first().click()

    // Textarea should load with YAML content containing the workflow name
    await expect(page.locator('textarea').first()).toHaveValue(/DailyIngestion/, { timeout: 5_000 })

    // Commit message input should be present
    await expect(page.locator('input[placeholder*="ci: update"]').first()).toBeVisible({ timeout: 5_000 })

    // Save button is visible
    await expect(page.getByRole('button', { name: /save/i }).first()).toBeVisible({ timeout: 5_000 })
  })

  // ── Journey 19: GH Actions secrets CRUD ─────────────────────────
  test('Journey 19: secrets page shows secret list', async ({ page }) => {
    await installPhase3Mocks(page)

    await loginViaUi(page)
    await page.goto('/gh-actions/secrets')
    await expect(page.locator('h1')).toContainText(/secrets/i, { timeout: 10_000 })

    await expect(page.getByText('GH_TOKEN')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText('D1_API_TOKEN')).toBeVisible({ timeout: 5_000 })
  })

  // ── Journey 20: Migrations list + SQL preview ────────────────────
  test('Journey 20: migrations page shows list and unapplied count', async ({ page }) => {
    await installPhase3Mocks(page)

    await loginViaUi(page)
    await page.goto('/migrations')
    await expect(page.locator('h1')).toContainText(/migrations/i, { timeout: 10_000 })

    await expect(page.getByText('001_initial_schema.sql')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText('003_add_operations.sql')).toBeVisible({ timeout: 5_000 })

    // Badge showing "1 unapplied"
    await expect(page.getByText(/1 unapplied/i).first()).toBeVisible({ timeout: 5_000 })
  })

  // ── Journey 21: Log search with filtering ────────────────────────
  test('Journey 21: log search returns and displays results', async ({ page }) => {
    await installPhase3Mocks(page)

    await loginViaUi(page)
    await page.goto('/logs')
    await expect(page.locator('h1')).toContainText(/logs/i, { timeout: 10_000 })

    // Fill the search query input and submit
    await page.locator('input').first().fill('ABC-123')
    await page.getByRole('button', { name: /search/i }).click()

    // Results from mock should appear
    await expect(page.getByText('Processing movie ABC-123').first()).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText('job-abc-001').first()).toBeVisible({ timeout: 5_000 })
  })

  // ── Journey 22: Statistics dashboard ────────────────────────────
  test('Journey 22: stats dashboard shows summary cards and chart tabs', async ({ page }) => {
    await installPhase3Mocks(page)

    await loginViaUi(page)
    await page.goto('/stats')
    await expect(page.locator('h1')).toContainText(/statistics/i, { timeout: 10_000 })

    // Summary cards from mock: total_runs=142, success_rate=0.95 → "95.0%"
    await expect(page.getByText('142').first()).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText('95.0%').first()).toBeVisible({ timeout: 5_000 })

    // Chart tabs (from i18n: stats.tabs.runs = "Run Metrics")
    await expect(page.getByText('Run Metrics').first()).toBeVisible({ timeout: 5_000 })
  })
})
