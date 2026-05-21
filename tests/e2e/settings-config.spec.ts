import { test, expect, type APIRequestContext } from '@playwright/test'
import { getAuthHeaders, loginViaUi, markOnboarded, resetBackend } from './fixtures/auth'

const API_URL = process.env.E2E_API_URL ?? 'http://127.0.0.1:8100'

async function fetchConfigValue(
  request: APIRequestContext,
  key: string,
): Promise<unknown> {
  const headers = await getAuthHeaders(request)
  const r = await request.get(`${API_URL}/api/config`, { headers })
  if (!r.ok()) return undefined
  const body = (await r.json()) as Record<string, unknown>
  return body[key]
}

test.describe('Journey 6: Settings → Config edit + save round-trip', () => {
  test.beforeEach(async ({ request }) => {
    await resetBackend(request)
    await markOnboarded(request)
  })

  test('toggles a non-sensitive bool, saves, and the new value persists across reload', async ({
    page,
    request,
  }) => {
    await loginViaUi(page)
    await page.goto('/settings/config')
    await expect(page.locator('text=/config|configuration/i').first()).toBeVisible({
      timeout: 10_000,
    })

    // We use AUTO_START — a bool in QBITTORRENT CONFIGURATION, defaults to true,
    // safe to toggle in either direction with no live side effects.
    const before = await fetchConfigValue(request, 'AUTO_START')

    // Find the AUTO_START field label (label is the raw key when i18n is missing,
    // or a translated string when present). Locate by adjacent NSwitch.
    const autoStartLabel = page.locator('label, .label').filter({ hasText: /^AUTO_START$|Auto-?start/i })
    test.skip(
      (await autoStartLabel.count()) === 0,
      'AUTO_START field not rendered. Check that /api/config returns it.',
    )

    // The switch lives in the same .config-field container as the label.
    const fieldContainer = autoStartLabel.first().locator('xpath=ancestor::*[contains(@class, "config-field")][1]')
    const toggle = fieldContainer.locator('.n-switch').first()
    await toggle.click()

    // Save bar appears — click Save
    const saveBtn = page.getByRole('button', { name: /^save$/i })
    await expect(saveBtn).toBeEnabled({ timeout: 5_000 })
    await saveBtn.click()

    await expect(page.locator('text=/Config saved/i').first()).toBeVisible({
      timeout: 10_000,
    })

    // Reload and re-fetch from BE; new value should be opposite of before.
    await page.reload()
    await expect(page.locator('text=/AUTO_START|Auto-?start/i').first()).toBeVisible({
      timeout: 10_000,
    })
    const after = await fetchConfigValue(request, 'AUTO_START')
    expect(typeof after === 'boolean').toBe(true)
    expect(after).not.toBe(before)
  })

  test('saves a string field and persists', async ({ page, request }) => {
    await loginViaUi(page)
    await page.goto('/settings/config')

    // Use TORRENT_CATEGORY — a non-sensitive string, safe to change.
    const before = (await fetchConfigValue(request, 'TORRENT_CATEGORY')) as string | undefined
    const nextValue = `e2e-test-${Date.now()}`

    const label = page
      .locator('label, .label')
      .filter({ hasText: /^TORRENT_CATEGORY$|Daily Torrent Category|每日任务种子分类/i })
    test.skip(
      (await label.count()) === 0,
      'TORRENT_CATEGORY field not rendered.',
    )
    const fieldContainer = label.first().locator('xpath=ancestor::*[contains(@class, "config-field")][1]')
    const input = fieldContainer.locator('input').first()
    await input.fill(nextValue)

    await page.getByRole('button', { name: /^save$/i }).click()
    await expect(page.locator('text=/Config saved/i').first()).toBeVisible({
      timeout: 10_000,
    })

    const after = await fetchConfigValue(request, 'TORRENT_CATEGORY')
    expect(after).toBe(nextValue)

    // Restore so the next test starts clean.
    if (typeof before === 'string') {
      const restoreHeaders = await getAuthHeaders(request)
      await request.put(`${API_URL}/api/config`, {
        headers: restoreHeaders,
        data: { TORRENT_CATEGORY: before },
      })
    }
  })
})
