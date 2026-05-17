import { defineStore } from 'pinia'
import { computed } from 'vue'
import { useStorage } from '@vueuse/core'
import { apiLogin, apiRefresh, apiLogout } from '@/api/auth'

export type Role = 'admin' | 'readonly' | null

export const useAuthStore = defineStore('auth', () => {
  // Tokens persisted to sessionStorage so a refresh doesn't drop the session
  // but closing the tab does.
  const accessToken = useStorage<string | null>('auth:access', null, sessionStorage)
  const refreshToken = useStorage<string | null>('auth:refresh', null, sessionStorage)
  const role = useStorage<Role>('auth:role', null, sessionStorage)
  const username = useStorage<string | null>('auth:user', null, sessionStorage)
  // CSRF token from login response body. In dev (plain HTTP) the browser drops
  // the BE's secure=True cookie, so we store the token here and the axios
  // interceptor prefers it over document.cookie.
  const csrfToken = useStorage<string | null>('auth:csrf', null, sessionStorage)

  const isAuthenticated = computed(() => !!accessToken.value)

  async function login(u: string, p: string): Promise<void> {
    const data = await apiLogin(u, p)
    accessToken.value = data.access_token
    refreshToken.value = data.refresh_token
    role.value = data.role as Role
    username.value = data.username ?? u
    // CRITICAL: store CSRF token so the interceptor can send it as a header
    // even if the browser drops the cookie (secure=True on plain HTTP).
    csrfToken.value = (data as { csrf_token?: string }).csrf_token ?? null
  }

  async function refresh(): Promise<string> {
    if (!refreshToken.value) throw new Error('no refresh token')
    const data = await apiRefresh(refreshToken.value)
    accessToken.value = data.access_token
    // BE may rotate CSRF on refresh — capture if present
    const newCsrf = (data as { csrf_token?: string }).csrf_token
    if (newCsrf) csrfToken.value = newCsrf
    return data.access_token
  }

  function setAccessToken(token: string) {
    accessToken.value = token
  }

  async function logout(): Promise<void> {
    try {
      if (accessToken.value) await apiLogout()
    } catch {
      /* ignore — we clear local state regardless */
    } finally {
      accessToken.value = null
      refreshToken.value = null
      role.value = null
      username.value = null
      csrfToken.value = null
    }
  }

  function hasRole(required: Role | Role[]): boolean {
    if (!role.value) return false
    const required_ = Array.isArray(required) ? required : [required]
    return required_.includes(role.value)
  }

  return {
    accessToken,
    refreshToken,
    role,
    username,
    csrfToken,
    isAuthenticated,
    login,
    refresh,
    logout,
    hasRole,
    setAccessToken,
  }
})
