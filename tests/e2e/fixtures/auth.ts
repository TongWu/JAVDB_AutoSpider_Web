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

export async function markOnboarded(request: APIRequestContext): Promise<void> {
  try {
    const headers = await getAuthHeaders(request)
    await request.post(`${API_URL}/api/onboarding/complete`, { headers })
  } catch {
    /* ignore */
  }
}
