import { http } from './client'

// Hand-typed until src/types/api.gen.ts is regenerated to include the ADR-054
// WS2 new-works endpoints. Shapes mirror server/routes/subscriptions.ts.

export interface NewWork {
  video_code: string
  href: string
  actor_href: string
  title: string | null
  release_date: string | null
  discovered_at: string
  dismissed: boolean
}

export interface NewWorkListResponse {
  items: NewWork[]
  total: number
}

export async function listNewWorks(
  params: {
    actorHref?: string | null
    includeDismissed?: boolean
    limit?: number
    offset?: number
  } = {},
): Promise<NewWorkListResponse> {
  const { data } = await http.get<NewWorkListResponse>('/api/new-works', {
    params: {
      actor_href: params.actorHref ?? undefined,
      include_dismissed: params.includeDismissed ?? undefined,
      limit: params.limit ?? 50,
      offset: params.offset ?? 0,
    },
  })
  return data
}

export async function dismissNewWork(videoCode: string): Promise<void> {
  await http.post(`/api/new-works/${encodeURIComponent(videoCode)}/dismiss`)
}
