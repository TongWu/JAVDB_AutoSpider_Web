import type { Page, APIRequestContext } from '@playwright/test'

const ADMIN_USERNAME = process.env.E2E_ADMIN_USERNAME ?? 'admin'
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'changeme'
const API_URL = process.env.E2E_API_URL ?? 'http://127.0.0.1:8100'

export async function resetBackend(request: APIRequestContext): Promise<void> {
  // Only effective if BE is started with TEST_MODE=1. If 404, skip silently —
  // it means BE isn't in test mode and we accept whatever state it has.
  try {
    await request.post(`${API_URL}/api/test/reset`)
  } catch {
    /* ignore */
  }
}

export async function loginViaUi(page: Page, username = ADMIN_USERNAME, password = ADMIN_PASSWORD): Promise<void> {
  await page.goto('/login')
  await page.fill('input[type="text"]', username)
  await page.fill('input[type="password"]', password)
  await page.getByRole('button', { name: /sign in/i }).click()
  // Wait for either redirect to home or onboarding
  await page.waitForURL((url) => !/\/login$/.test(url.pathname), { timeout: 10_000 })
}

export async function markOnboarded(request: APIRequestContext): Promise<void> {
  // Best-effort: tell BE the user is already onboarded so we skip the wizard
  // redirect on subsequent specs.
  try {
    // Login first to get a CSRF + access token cookie set by BE
    await request.post(`${API_URL}/api/auth/login`, {
      data: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
    })
    await request.post(`${API_URL}/api/onboarding/complete`)
  } catch {
    /* ignore */
  }
}
