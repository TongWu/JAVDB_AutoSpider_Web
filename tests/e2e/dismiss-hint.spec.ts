import { test, expect } from '@playwright/test'
import { loginViaUi, markOnboarded, resetBackend } from './fixtures/auth'

test.describe('Journey 8a: dismiss a hint card from Home → persisted', () => {
  test.beforeEach(async ({ request, page }) => {
    await resetBackend(request)
    await markOnboarded(request)

    // Onboarding status: completed but with skippable integrations unconfigured
    await page.route('**/api/onboarding/status', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          completed: true,
          required_missing: [],
          skippable_missing: ['smtp', 'pikpak'],
        }),
      }),
    )

    // System state: no hints dismissed yet
    await page.route('**/api/system/state**', (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ key: 'dismissed_hints', value: '[]' }),
        })
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    })

    // Dismiss hint endpoint: accept silently
    await page.route('**/api/onboarding/dismiss-hint', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
    )
  })

  test('hint cards render on Home, dismiss persists after reload', async ({ page }) => {
    await loginViaUi(page)
    await page.goto('/')

    // Two hint cards should be visible (smtp, pikpak)
    const hintCards = page.locator('.hint-card')
    await expect(hintCards.first()).toBeVisible({ timeout: 10_000 })
    const initialCount = await hintCards.count()
    expect(initialCount).toBe(2)

    // Click Dismiss on the first hint card
    await hintCards.first().getByRole('button', { name: /dismiss/i }).click()

    // One fewer hint card after dismiss
    await expect(hintCards).toHaveCount(initialCount - 1, { timeout: 5_000 })

    // Now simulate that system/state returns the dismissed hint on reload
    await page.unroute('**/api/system/state**')
    await page.route('**/api/system/state**', (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ key: 'dismissed_hints', value: '["smtp"]' }),
        })
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    })

    // Reload and verify the dismissed hint stays gone
    await page.goto('/')
    await expect(hintCards.first()).toBeVisible({ timeout: 10_000 })
    await expect(hintCards).toHaveCount(1)
  })
})
