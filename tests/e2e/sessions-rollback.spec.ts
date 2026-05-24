import { test, expect } from '@playwright/test'
import { loginViaUi, markOnboarded, resetBackend } from './fixtures/auth'
import { installSessionMocks, COMMITTED_SESSION, FINALIZING_SESSION } from './fixtures/session-mocks'

test.describe('Journey 5/5a/5b: Sessions list + rollback + force-commit', () => {
  test.beforeEach(async ({ request, page }) => {
    await resetBackend(request)
    await markOnboarded(request, page)
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

    // Wait for mock data to render in the table, then click the committed row
    const committedRow = page.locator('tr', { hasText: COMMITTED_SESSION.session_id })
    await expect(committedRow).toBeVisible({ timeout: 10_000 })
    await committedRow.click()

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

    // Wait for the finalizing row to appear and click it
    const finalizingRow = page.locator('tr', { hasText: FINALIZING_SESSION.session_id })
    await expect(finalizingRow).toBeVisible({ timeout: 10_000 })
    await finalizingRow.click()
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

    // Wait for mock data to render, then click first data row
    const firstRow = page.locator('tr', { hasText: COMMITTED_SESSION.session_id })
    await expect(firstRow).toBeVisible({ timeout: 10_000 })
    await firstRow.click()
    await expect(page.locator('.n-drawer')).toBeVisible({ timeout: 5_000 })

    await page.getByRole('button', { name: /rollback/i }).click()

    // "Include pending writes" checkbox visible (audit mode retired by ADR-005)
    await expect(page.getByText(/include pending/i)).toBeVisible({ timeout: 5_000 })

    // Run dry-run
    await page.getByRole('button', { name: /(run )?dry.?run|preview/i }).click()

    // Preview area renders — apply button becomes enabled
    await expect(page.getByRole('button', { name: /apply.*rollback/i })).toBeEnabled({
      timeout: 5_000,
    })
  })
})
