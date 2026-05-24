import { test, expect, type APIRequestContext } from '@playwright/test'
import { getAuthHeaders, loginViaUi, markOnboarded, resetBackend } from './fixtures/auth'

const API_URL = process.env.E2E_API_URL ?? 'http://127.0.0.1:8100'

async function fetchConfigValue(
  request: APIRequestContext,
  key: string,
  headers: Record<string, string>,
): Promise<unknown> {
  const r = await request.get(`${API_URL}/api/config`, { headers })
  if (!r.ok()) return undefined
  const body = (await r.json()) as Record<string, unknown>
  return body[key]
}

test.describe('Journey 6: Settings → Config edit + save round-trip', () => {
  test.beforeEach(async ({ request, page }) => {
    await resetBackend(request)
    await markOnboarded(request, page)
  })

  test('toggles a non-sensitive bool, saves, and the new value persists across reload', async ({
    page,
    request,
  }) => {
    await loginViaUi(page)
    await page.goto('/settings/config')

    // Wait for config fields to render (async load from API)
    await expect(page.getByText(/Auto-?Start/i).first()).toBeVisible({ timeout: 10_000 })

    // Obtain auth headers once to avoid exhausting the session limit
    const headers = await getAuthHeaders(request)

    const before = await fetchConfigValue(request, 'AUTO_START', headers)

    // Find the AUTO_START field — the label renders as <label class="label">
    // inside a div.config-field container with an NSwitch sibling.
    const autoStartLabel = page.locator('label, .label').filter({ hasText: /^AUTO_START$|Auto-?start/i })

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
    const after = await fetchConfigValue(request, 'AUTO_START', headers)
    expect(typeof after === 'boolean').toBe(true)
    expect(after).not.toBe(before)
  })

  test('saves a string field and persists', async ({ page, request }) => {
    await loginViaUi(page)
    await page.goto('/settings/config')

    // Wait for config fields to render (async load from API)
    await expect(page.getByText(/Torrent Category/i).first()).toBeVisible({ timeout: 10_000 })

    // Obtain auth headers once
    const headers = await getAuthHeaders(request)

    const before = (await fetchConfigValue(request, 'TORRENT_CATEGORY', headers)) as string | undefined
    const nextValue = `e2e-test-${Date.now()}`

    const label = page
      .locator('label, .label')
      .filter({ hasText: /^TORRENT_CATEGORY$|Daily Torrent Category|每日任务种子分类/i })
    const fieldContainer = label.first().locator('xpath=ancestor::*[contains(@class, "config-field")][1]')
    const input = fieldContainer.locator('input').first()
    await input.fill(nextValue)

    await page.getByRole('button', { name: /^save$/i }).click()
    await expect(page.locator('text=/Config saved/i').first()).toBeVisible({
      timeout: 10_000,
    })

    const after = await fetchConfigValue(request, 'TORRENT_CATEGORY', headers)
    expect(after).toBe(nextValue)

    // Restore so the next test starts clean.
    if (typeof before === 'string') {
      await request.put(`${API_URL}/api/config`, {
        headers,
        data: { TORRENT_CATEGORY: before },
      })
    }
  })
})
