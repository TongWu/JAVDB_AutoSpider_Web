import { test, expect } from '@playwright/test'
import { loginViaUi, markOnboarded, resetBackend } from './fixtures/auth'
import { installBrowseMocks, SAMPLE_DETAIL_URL } from './fixtures/javdb-mocks'

test.describe('Journey 4b: Browse → Preview → Parse this', () => {
  test.beforeEach(async ({ request, page }) => {
    await resetBackend(request)
    await markOnboarded(request)
    await installBrowseMocks(page)
  })

  test('fetches a sanitised snapshot and hands off to Resolve via Parse this', async ({
    page,
  }) => {
    await loginViaUi(page)
    await page.goto('/browse?mode=preview')

    // Fill the preview URL input
    const url = page.getByPlaceholder(/URL to preview|预览|プレビュー/i)
    await url.fill(SAMPLE_DETAIL_URL)

    await page.getByRole('button', { name: /fetch preview|获取预览|プレビューを取得/i }).click()

    // Iframe is rendered with srcdoc content
    const frame = page.locator('iframe.preview-iframe')
    await expect(frame).toBeVisible({ timeout: 10_000 })

    // "Parse this" — switches mode to resolve and submits the URL
    await page.getByRole('button', { name: /parse this|解析此页|このページをパース/i }).click()

    // URL query string updates to ?mode=resolve
    await expect(page).toHaveURL(/mode=resolve/, { timeout: 5_000 })

    // The detail card appears (since /api/explore/resolve is mocked)
    await expect(page.locator('text=/Sample Title for E2E/i')).toBeVisible({
      timeout: 10_000,
    })
  })
})
