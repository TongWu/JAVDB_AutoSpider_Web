import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/api/auth', () => ({
  apiLogin: vi.fn(async (u: string) => ({
    access_token: 'access-1',
    refresh_token: 'refresh-1',
    csrf_token: 'csrf-1',
    role: 'admin',
    expires_in: 3600,
    username: u,
  })),
  apiRefresh: vi.fn(async () => ({ access_token: 'access-2', expires_in: 3600 })),
  apiLogout: vi.fn(async () => undefined),
}))

import { useAuthStore } from '@/stores/auth'

describe('auth store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    sessionStorage.clear()
  })

  it('login populates state', async () => {
    const auth = useAuthStore()
    await auth.login('alice', 'pw')
    expect(auth.isAuthenticated).toBe(true)
    expect(auth.accessToken).toBe('access-1')
    expect(auth.username).toBe('alice')
    expect(auth.role).toBe('admin')
  })

  it('refresh updates access token', async () => {
    const auth = useAuthStore()
    await auth.login('alice', 'pw')
    const newToken = await auth.refresh()
    expect(newToken).toBe('access-2')
    expect(auth.accessToken).toBe('access-2')
  })

  it('logout clears state', async () => {
    const auth = useAuthStore()
    await auth.login('alice', 'pw')
    await auth.logout()
    expect(auth.isAuthenticated).toBe(false)
    expect(auth.accessToken).toBe(null)
    expect(auth.username).toBe(null)
  })

  it('hasRole returns true when role matches', async () => {
    const auth = useAuthStore()
    await auth.login('alice', 'pw')
    expect(auth.hasRole('admin')).toBe(true)
    expect(auth.hasRole(['admin', 'readonly'])).toBe(true)
    expect(auth.hasRole('readonly')).toBe(false)
  })
})
