import { test, expect } from '@playwright/test'
import { loginViaUi, markOnboarded, resetBackend } from './fixtures/auth'
import { installSessionMocks } from './fixtures/session-mocks'

test.describe('Journey 5/5a/5b: Sessions list + rollback + force-commit', () => {
  test.beforeEach(async ({ request, page }) => {
    await resetBackend(request)
    await markOnboarded(request)
    await installSessionMocks(page)
  })

  test('Journey 5: list sessions and dry-run + apply rollback on a committed row', async ({
    page,
  }) => {
    await loginViaUi(page)
    await page.goto('/sessions')
    await expect(page.getByRole('heading', { name: /sessions/i })).toBeVisible({
      timeout: 10_000,
    })

    // Click the first data row (skip header row)
    const firstRow = page.locator('.n-data-table-tr').nth(1)
    await firstRow.click()

    // Drawer should open
    await expect(page.locator('.n-drawer')).toBeVisible({ timeout: 5_000 })

    // Click Rollback in the drawer
    await page.getByRole('button', { name: /rollback/i }).click()

    // Dry-run preview step: trigger dry-run
    await page.getByRole('button', { name: /(run )?dry.?run|preview/i }).click()

    // Preview summary should appear — assert the "Apply rollback" button is now enabled
    const applyBtn = page.getByRole('button', { name: /apply.*rollback/i })
    await expect(applyBtn).toBeEnabled({ timeout: 5_000 })

    await applyBtn.click()

    // Success toast
    await expect(page.locator('text=/Rollback applied|success/i').first()).toBeVisible({
      timeout: 10_000,
    })
  })

  test('Journey 5a: force-commit a stuck finalizing session', async ({ page }) => {
    await loginViaUi(page)
    await page.goto('/sessions')

    // Filter to finalizing
    const stateFilter = page.getByPlaceholder(/filter by state/i)
    if (await stateFilter.isVisible()) {
      await stateFilter.click()
      await page.getByRole('option', { name: /finalizing/i }).click()
    }

    const firstRow = page.locator('.n-data-table-tr').nth(1)
    await firstRow.click()
    await expect(page.locator('.n-drawer')).toBeVisible({ timeout: 5_000 })

    await page.getByRole('button', { name: /force commit/i }).click()

    // Confirm in dialog
    await page.locator('.n-modal').getByRole('button', { name: /force commit/i }).click()

    await expect(page.locator('text=/Session committed|success/i').first()).toBeVisible({
      timeout: 10_000,
    })
  })

  test('Journey 5b: rollback with restore_from_audit + include_pending toggles', async ({
    page,
  }) => {
    await loginViaUi(page)
    await page.goto('/sessions')

    const firstRow = page.locator('.n-data-table-tr').nth(1)
    await firstRow.click()
    await expect(page.locator('.n-drawer')).toBeVisible({ timeout: 5_000 })

    await page.getByRole('button', { name: /rollback/i }).click()

    // Both checkboxes default to true per Plan D — verify the form is visible.
    await expect(page.getByText(/include pending/i)).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText(/restore from audit/i)).toBeVisible({ timeout: 5_000 })

    // Run dry-run
    await page.getByRole('button', { name: /(run )?dry.?run|preview/i }).click()

    // Preview area renders — apply button becomes enabled
    await expect(page.getByRole('button', { name: /apply.*rollback/i })).toBeEnabled({
      timeout: 5_000,
    })
  })
})
