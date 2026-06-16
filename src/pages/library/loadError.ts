import { isNetworkError } from '@/api/client'

/**
 * Maps a fetch failure to a user-facing, localized message for the Library
 * views' inline error banners. Connectivity and timeout failures (which carry
 * no HTTP status, so the global toast interceptor stays silent) resolve to the
 * shared `common.networkError` string; every other failure falls back to the
 * caller's view-specific load-error key. The caller passes its own `t` so the
 * active i18n scope is preserved.
 */
export function loadErrorMessage(
  err: unknown,
  t: (key: string) => string,
  fallbackKey: string,
): string {
  return isNetworkError(err) ? t('common.networkError') : t(fallbackKey)
}
