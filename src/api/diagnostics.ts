import { http } from './client'

// ── Deep health check ────────────────────────────────────────────────
export async function deepHealthCheck(): Promise<Record<string, unknown>> {
  const { data } = await http.post<Record<string, unknown>>('/api/health-check')
  return data
}

// ── JavDB session diagnostics ────────────────────────────────────────
export interface JavdbSessionStatus {
  cookie_present: boolean
  cookie_value_preview?: string
  last_refresh_time?: string
  estimated_expiry?: string
  is_likely_valid: boolean
}

export interface JavdbSessionRefreshRequest {
  method: 'headless' | 'cookie_paste'
  cookie_value?: string
}

export interface JavdbSessionRefreshResponse {
  success: boolean
  method: string
  new_cookie_preview?: string
  error?: string
}

export async function getJavdbSession(): Promise<JavdbSessionStatus> {
  const { data } = await http.get<JavdbSessionStatus>('/api/diag/javdb-session')
  return data
}

export async function refreshJavdbSession(
  req: JavdbSessionRefreshRequest,
): Promise<JavdbSessionRefreshResponse> {
  const { data } = await http.post<JavdbSessionRefreshResponse>(
    '/api/diag/javdb-session/refresh',
    req,
  )
  return data
}

// ── HTML parse endpoints ─────────────────────────────────────────────
export type ParseType = 'index' | 'detail' | 'category' | 'top' | 'tags'

export async function parseHtml(
  type: ParseType,
  html: string,
): Promise<Record<string, unknown>> {
  const { data } = await http.post<Record<string, unknown>>(`/api/parse/${type}`, { html })
  return data
}

export async function detectPageType(html: string): Promise<{ page_type: string }> {
  const { data } = await http.post<{ page_type: string }>('/api/detect-page-type', { html })
  return data
}

// ── Login refresh (headless re-login) ────────────────────────────────
export async function loginRefresh(): Promise<Record<string, unknown>> {
  const { data } = await http.post<Record<string, unknown>>('/api/login/refresh')
  return data
}
