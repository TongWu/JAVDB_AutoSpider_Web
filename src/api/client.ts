import axios, { AxiosError, AxiosHeaders, type AxiosRequestConfig } from 'axios'

// Extend AxiosRequestConfig to allow per-request opt-out of the global error toast.
// Usage: http.post(url, data, { skipErrorToast: true } as AxiosRequestConfig & { skipErrorToast?: boolean })
declare module 'axios' {
  interface AxiosRequestConfig {
    skipErrorToast?: boolean
  }
}

type QueuedRequest = {
  config: AxiosRequestConfig
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
}

const baseURL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8100'

export const http = axios.create({
  baseURL,
  withCredentials: true,
  timeout: 30_000,
})

// === X-Request-Id injection ============================================
http.interceptors.request.use((config) => {
  const headers = AxiosHeaders.from(config.headers)
  headers.set('X-Request-Id', crypto.randomUUID())
  config.headers = headers
  return config
})

// === Authorization + CSRF injection ====================================
// These hooks read fresh values per-request from the auth store. The store
// is dynamically imported to avoid a circular dep at module init time.
http.interceptors.request.use(async (config) => {
  const { useAuthStore } = await import('@/stores/auth')
  const auth = useAuthStore()
  const headers = AxiosHeaders.from(config.headers)

  if (auth.accessToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${auth.accessToken}`)
  }

  const method = (config.method ?? 'get').toUpperCase()
  const mutating =
    method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE'
  if (mutating) {
    const csrf = readCsrfCookie()
    if (csrf) headers.set('X-CSRF-Token', csrf)
  }

  config.headers = headers
  return config
})

function readCsrfCookie(): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/)
  return match ? decodeURIComponent(match[1]) : null
}

// === Global error toast (non-401) ======================================
// Shows a NaiveUI message for 4xx/5xx responses unless the request opted out
// via config.skipErrorToast = true (used by forms that render their own error UI).
http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const cfg = error.config as (AxiosRequestConfig & { _retried?: boolean }) | undefined
    const status = error.response?.status
    // 401 is handled by the refresh queue below — skip it here
    if (status && status !== 401 && !cfg?.skipErrorToast) {
      const { useMessage } = await import('naive-ui')
      try {
        const msg = useMessage()
        const data = error.response?.data as { detail?: unknown; error?: { message?: string } } | null
        let text = `HTTP ${status}`
        if (data?.error?.message) text = data.error.message
        else if (typeof data?.detail === 'string') text = data.detail
        msg.error(text, { duration: 4000 })
      } catch {
        // Outside of NaiveUI context (e.g. unit tests) — ignore
      }
    }
    throw error
  },
)

// === 401 single-flight refresh queue ===================================
let refreshing: Promise<string> | null = null
const queue: QueuedRequest[] = []

http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as
      | (AxiosRequestConfig & { _retried?: boolean })
      | undefined

    if (!original) throw error
    if (error.response?.status !== 401) throw error
    if (original.url?.includes('/api/auth/refresh')) throw error
    if (original.url?.includes('/api/auth/login')) throw error
    if (original._retried) throw error

    if (!refreshing) {
      // Set refreshing synchronously BEFORE any await so concurrent 401s
      // arriving in the same microtask batch all see it and enter the queue.
      refreshing = (async () => {
        const { useAuthStore } = await import('@/stores/auth')
        const auth = useAuthStore()
        const router = (await import('@/router')).default

        return auth
          .refresh()
          .then((newToken) => {
            flushQueue(newToken)
            return newToken
          })
          .catch((reason) => {
            failQueue(reason)
            void auth.logout()
            void router.push({ name: 'login' })
            throw reason
          })
          .finally(() => {
            refreshing = null
          })
      })()
    }

    return new Promise((resolve, reject) => {
      queue.push({ config: original, resolve, reject })
    })
  },
)

function flushQueue(newToken: string) {
  const pending = queue.splice(0)
  for (const { config, resolve, reject } of pending) {
    const headers = new AxiosHeaders(config.headers as Record<string, string> | undefined)
    headers.set('Authorization', `Bearer ${newToken}`)
    config.headers = headers
    ;(config as AxiosRequestConfig & { _retried?: boolean })._retried = true
    http.request(config).then(resolve).catch(reject)
  }
}

function failQueue(reason: unknown) {
  const pending = queue.splice(0)
  for (const { reject } of pending) reject(reason)
}
