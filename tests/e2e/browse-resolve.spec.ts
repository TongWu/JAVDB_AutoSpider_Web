import { test, expect } from '@playwright/test'
import { loginViaUi, markOnboarded, resetBackend } from './fixtures/auth'
import { installBrowseMocks, SAMPLE_VIDEO_CODE } from './fixtures/javdb-mocks'

test.describe('Journey 4: Browse → Resolve → magnet → one-click', () => {
  test.beforeEach(async ({ request, page }) => {
    await resetBackend(request)
    await markOnboarded(request, page)
    await installBrowseMocks(page)
  })

  test('searches by video code, sees magnet table, downloads + one-click', async ({
    page,
  }) => {
    await loginViaUi(page)
    await page.goto('/browse')
    await expect(page.getByRole('heading', { name: /browse|浏览|ブラウズ/i })).toBeVisible({
      timeout: 10_000,
    })

    // Submit the video code
    const input = page.getByPlaceholder(/video code|番号|動画コード/i)
    await input.fill(SAMPLE_VIDEO_CODE)
    await page.getByRole('button', { name: /^search$|查询|検索/i }).click()

    // Code search returns the exact-match callout; clicking "Open detail"
    // resubmits as a URL and reveals the detail card + magnet table.
    await expect(page.getByText(/exact match|完全匹配|完全一致/i)).toBeVisible({
      timeout: 10_000,
    })
    await page.getByRole('button', { name: /open detail|打开详情|詳細を開く/i }).click()

    // Detail card with magnet table renders
    await expect(page.locator('.n-data-table')).toBeVisible({ timeout: 10_000 })

    // Download the first magnet
    await page.getByRole('button', { name: /^download$|^下载$|^ダウンロード$/i }).first().click()
    await expect(page.locator('text=/added to qBittorrent|qBittorrent|追加しました/i').first()).toBeVisible({
      timeout: 5_000,
    })

    // One-click
    await page.getByRole('button', { name: /one.?click|一键下载|ワンクリック/i }).click()
    await expect(page.locator('text=/Magnet queued|已加入|追加しました/i').first()).toBeVisible({
      timeout: 5_000,
    })
  })
})
