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
  // Wait for either redirect to home or onboarding.
  // Allow 30s for slow browsers (Firefox/WebKit) where CapabilitiesGate boot is async.
  await page.waitForURL((url) => !/\/login$/.test(url.pathname), { timeout: 30_000 })
}

export async function getAuthHeaders(request: APIRequestContext): Promise<Record<string, string>> {
  const res = await request.post(`${API_URL}/api/auth/login`, {
    data: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
  })
  const body = await res.json()
  const token = body.access_token as string | undefined
  const csrf = body.csrf_token as string | undefined
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (csrf) {
    headers['X-CSRF-Token'] = csrf
    headers['Cookie'] = `csrf_token=${csrf}`
  }
  return headers
}

export async function markOnboarded(request: APIRequestContext, page?: Page): Promise<void> {
  // BE-side: best-effort. The CI Docker BE sometimes can't persist this
  // write (operations.db path/perm/schema), so we cannot rely on it alone.
  try {
    const headers = await getAuthHeaders(request)
    await request.post(`${API_URL}/api/onboarding/complete`, { headers })
  } catch {
    /* ignore */
  }
  // Browser-side: authoritative mock of /api/onboarding/status, so the
  // CapabilitiesGate boot never redirects the user to /onboarding even if
  // the BE write above silently failed. Tests that genuinely exercise the
  // onboarding flow (onboarding.spec.ts) do not call this helper.
  if (page) {
    await page.route('**/api/onboarding/status', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          completed: true,
          required_missing: [],
          skippable_missing: [],
        }),
      }),
    )
  }
}
