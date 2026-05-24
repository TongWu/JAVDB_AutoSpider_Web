import { test, expect, type APIRequestContext } from '@playwright/test'
import { loginViaUi, markOnboarded, resetBackend } from './fixtures/auth'

const ADMIN_USERNAME = process.env.E2E_ADMIN_USERNAME ?? 'admin'
const ORIGINAL_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'changeme'
const API_URL = process.env.E2E_API_URL ?? 'http://127.0.0.1:8100'

const TEMP_PASSWORD = `e2e-temp-${Date.now()}-aB9!`

async function restoreOriginalPassword(
  request: APIRequestContext,
  currentPassword: string,
): Promise<void> {
  // Best-effort cleanup so the next test run can log in with the original
  // credentials. If this fails the test environment has to be reset manually
  // (e.g. restart the BE with TEST_MODE=1 + clear api_config_store.json).
  try {
    const loginRes = await request.post(`${API_URL}/api/auth/login`, {
      data: { username: ADMIN_USERNAME, password: currentPassword },
    })
    if (!loginRes.ok()) return
    const body = (await loginRes.json()) as { access_token?: string; csrf_token?: string }
    if (!body.access_token || !body.csrf_token) return
    await request.post(`${API_URL}/api/auth/change-password`, {
      headers: {
        Authorization: `Bearer ${body.access_token}`,
        'X-CSRF-Token': body.csrf_token,
        Cookie: `csrf_token=${body.csrf_token}`,
      },
      data: {
        current_password: currentPassword,
        new_password: ORIGINAL_PASSWORD,
      },
    })
  } catch {
    /* swallow — cleanup is best-effort */
  }
}

test.describe('Journey 7: change password → re-login round-trip', () => {
  test.beforeEach(async ({ request, page }) => {
    await resetBackend(request)
    await markOnboarded(request, page)
  })

  test.afterEach(async ({ request }) => {
    // Always try to restore the original password, regardless of test outcome.
    await restoreOriginalPassword(request, TEMP_PASSWORD)
  })

  test('admin changes password, signs out, and signs in with the new password', async ({
    page,
  }) => {
    await loginViaUi(page, ADMIN_USERNAME, ORIGINAL_PASSWORD)

    // Navigate to Auth tab
    await page.goto('/settings/auth')
    await expect(page.getByText(new RegExp(ADMIN_USERNAME, 'i')).first()).toBeVisible({
      timeout: 10_000,
    })

    // Open dialog
    await page.getByRole('button', { name: /change password/i }).click()
    await expect(page.locator('.n-modal')).toBeVisible({ timeout: 5_000 })

    // Fill three fields. Selectors target the modal so they don't collide with
    // any password-style input outside the dialog.
    const modal = page.locator('.n-modal')
    const inputs = modal.locator('input[type="password"]')
    await inputs.nth(0).fill(ORIGINAL_PASSWORD)
    await inputs.nth(1).fill(TEMP_PASSWORD)
    await inputs.nth(2).fill(TEMP_PASSWORD)

    // Submit
    await modal.getByRole('button', { name: /^change password$/i }).click()

    // Success toast
    await expect(page.locator('text=/Password changed|密码已修改|パスワードを変更しました/i').first()).toBeVisible({
      timeout: 10_000,
    })

    // Sign out via the danger button in the Auth card
    await page.getByRole('button', { name: /sign out|退出|サインアウト/i }).click()
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })

    // Re-login with the new password
    await loginViaUi(page, ADMIN_USERNAME, TEMP_PASSWORD)
    await expect(page).not.toHaveURL(/\/login/)

    // Confirm we landed inside the app (home or onboarding-but-marked-complete)
    await expect(page.locator('text=/Home|Dashboard|Onboarding|首页|ホーム/i').first()).toBeVisible({
      timeout: 10_000,
    })
  })

  test('wrong current password surfaces a server error in the dialog', async ({
    page,
  }) => {
    await loginViaUi(page, ADMIN_USERNAME, ORIGINAL_PASSWORD)
    await page.goto('/settings/auth')

    await page.getByRole('button', { name: /change password/i }).click()
    const modal = page.locator('.n-modal')
    const inputs = modal.locator('input[type="password"]')
    await inputs.nth(0).fill('definitely-not-the-current-password')
    await inputs.nth(1).fill('some-new-password-1234')
    await inputs.nth(2).fill('some-new-password-1234')

    await modal.getByRole('button', { name: /^change password$/i }).click()

    // Dialog stays open with an inline error (NAlert) — assert by text
    await expect(modal.locator('.n-alert')).toBeVisible({ timeout: 5_000 })
    await expect(modal).toBeVisible()
  })
})
