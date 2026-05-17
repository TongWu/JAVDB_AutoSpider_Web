import type { AxiosError } from 'axios'

export function extractErrorMessage(err: unknown): string {
  if (!err) return 'Unknown error'
  const ae = err as AxiosError<unknown>
  if (ae.response) {
    const data = ae.response.data as { detail?: unknown; error?: { message?: string } } | null
    // Custom envelope
    if (data?.error?.message) return data.error.message
    // FastAPI 422 returns detail as an array of validation errors
    if (Array.isArray(data?.detail)) {
      return (data.detail as { msg?: string; loc?: string[] }[])
        .map((d) => `${(d.loc ?? []).join('.')}: ${d.msg ?? 'invalid'}`)
        .join('; ')
    }
    if (typeof data?.detail === 'string') return data.detail
    return `HTTP ${ae.response.status}`
  }
  if (ae.message) return ae.message
  return String(err)
}
