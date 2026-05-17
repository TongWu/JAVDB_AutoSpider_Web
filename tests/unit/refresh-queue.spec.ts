import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import MockAdapter from 'axios-mock-adapter'

import { http } from '@/api/client'

let refreshCalls = 0

vi.mock('@/api/auth', () => ({
  apiLogin: vi.fn(async (u: string) => ({
    access_token: 'old',
    refresh_token: 'r1',
    csrf_token: 'c',
    role: 'admin',
    expires_in: 3600,
    username: u,
  })),
  apiRefresh: vi.fn(async () => {
    refreshCalls += 1
    // Simulate a slight async delay so concurrent calls can stack up
    await new Promise((r) => setTimeout(r, 10))
    return { access_token: 'new', expires_in: 3600 }
  }),
  apiLogout: vi.fn(async () => undefined),
}))

// Mock the router so the interceptor's push doesn't fail in test
vi.mock('@/router', () => ({
  default: { push: vi.fn() },
}))

describe('refresh queue — single-flight invariant', () => {
  let mock: MockAdapter

  beforeEach(async () => {
    setActivePinia(createPinia())
    sessionStorage.clear()
    refreshCalls = 0
    mock = new MockAdapter(http)

    // Seed the auth store with a valid session so the interceptor has a refreshToken
    const { useAuthStore } = await import('@/stores/auth')
    const auth = useAuthStore()
    await auth.login('alice', 'pw')
  })

  afterEach(() => {
    mock.restore()
  })

  it('concurrent 401s share exactly one refresh call, then replay succeeds', async () => {
    let serveCount = 0

    // First 3 responses are 401; subsequent responses (the retried requests) succeed
    mock.onGet('/api/echo').reply(() => {
      serveCount += 1
      if (serveCount <= 3) return [401, { error: { code: 'auth.expired' } }]
      return [200, { ok: true }]
    })

    const requests = [http.get('/api/echo'), http.get('/api/echo'), http.get('/api/echo')]
    const results = await Promise.allSettled(requests)

    // Exactly one refresh must have been attempted
    expect(refreshCalls).toBe(1)

    // All requests should eventually resolve (after replay with new token)
    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    expect(fulfilled.length).toBe(3)
  })
})
