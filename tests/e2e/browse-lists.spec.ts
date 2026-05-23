import { test, expect } from '@playwright/test'
import { loginViaUi, markOnboarded, resetBackend } from './fixtures/auth'
import { installBrowseMocks } from './fixtures/javdb-mocks'

test.describe('Journey 4a: Browse → Lists tab → badges → cookie sync', () => {
  test.beforeEach(async ({ request, page }) => {
    await resetBackend(request)
    await markOnboarded(request)
    await installBrowseMocks(page)
  })

  test('loads the Top tab via parse/url, renders cards + D1 badges', async ({ page }) => {
    await loginViaUi(page)
    await page.goto('/browse?mode=lists')

    // Sub-tabs visible (NTabs renders as generic divs, not role="tab")
    await expect(page.getByText('Top', { exact: true })).toBeVisible({
      timeout: 10_000,
    })

    // The URL input is pre-filled with the rankings default. Click Load.
    await page.getByRole('button', { name: /^load$|^加载$|^読み込む$/i }).click()

    // Cards appear (mocked to two entries)
    await expect(page.locator('text=/Top item one/i')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('text=/Top item two/i')).toBeVisible({ timeout: 10_000 })

    // D1 status dots render (one per card)
    await expect(page.locator('.d1-dot[data-status]').first()).toBeVisible()
  })

  test('Cookie sync uploads a cookie from the toolbar popover', async ({ page }) => {
    await loginViaUi(page)
    await page.goto('/browse')

    await page.getByRole('button', { name: /cookie sync|同步 cookie|cookie 同期/i }).click()
    const textarea = page.locator('textarea').first()
    await textarea.fill('_jdb_session=mock-session-cookie')
    await page.getByRole('button', { name: /^upload$|^上传$|^アップロード$/i }).click()
    await expect(page.locator('text=/Cookie uploaded|Cookie 已上传|Cookie をアップロード/i').first()).toBeVisible({
      timeout: 5_000,
    })
  })
})
