import axios from 'axios'
import { http } from './client'

// Hand-typed until src/types/api.gen.ts is regenerated to include the ADR-054
// WS1 watchlist endpoints. Shapes mirror server/routes/watchlist.ts.

export type WatchStatus = 'want' | 'viewed'

export interface WatchIntent {
  video_code: string
  href: string
  status: WatchStatus
  notes: string | null
  status_at: string | null
  updated_at: string
}

export interface WatchIntentListResponse {
  items: WatchIntent[]
  total: number
}

export async function listWatchIntents(
  params: { status?: WatchStatus | null; limit?: number; offset?: number } = {},
  opts: { skipErrorToast?: boolean } = {},
): Promise<WatchIntentListResponse> {
  const { data } = await http.get<WatchIntentListResponse>('/api/watchlist', {
    params: {
      status: params.status ?? undefined,
      limit: params.limit ?? 50,
      offset: params.offset ?? 0,
    },
    skipErrorToast: opts.skipErrorToast,
  })
  return data
}

export async function getWatchIntent(
  videoCode: string,
  opts: { skipErrorToast?: boolean } = {},
): Promise<WatchIntent | null> {
  try {
    const { data } = await http.get<WatchIntent>(
      `/api/watchlist/${encodeURIComponent(videoCode)}`,
      { skipErrorToast: opts.skipErrorToast },
    )
    return data
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 404) return null
    throw err
  }
}

export async function upsertWatchIntent(
  videoCode: string,
  payload: { href: string; status: WatchStatus; notes?: string | null },
): Promise<WatchIntent> {
  const { data } = await http.put<WatchIntent>(
    `/api/watchlist/${encodeURIComponent(videoCode)}`,
    payload,
  )
  return data
}

export async function deleteWatchIntent(videoCode: string): Promise<void> {
  await http.delete(`/api/watchlist/${encodeURIComponent(videoCode)}`)
}
