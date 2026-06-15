import axios from 'axios'
import { http } from './client'

// Hand-typed until src/types/api.gen.ts is regenerated to include the ADR-054
// WS2 subscription endpoints. Shapes mirror server/routes/subscriptions.ts.

export interface ActorSubscription {
  actor_href: string
  actor_name: string | null
  active: boolean
  last_seen_href: string | null
  last_checked_at: string | null
  created_at: string
  updated_at: string
}

export interface ActorSubscriptionListResponse {
  items: ActorSubscription[]
  total: number
}

// The actor_href is /actors/<id>; the route param is the bare <id>.
function actorIdFromHref(actorHref: string): string {
  return actorHref.replace(/^\/?actors\//, '').replace(/^\/+|\/+$/g, '')
}

export async function listSubscriptions(
  params: { activeOnly?: boolean; limit?: number; offset?: number } = {},
): Promise<ActorSubscriptionListResponse> {
  const { data } = await http.get<ActorSubscriptionListResponse>('/api/subscriptions', {
    params: {
      active_only: params.activeOnly ?? undefined,
      limit: params.limit ?? 200,
      offset: params.offset ?? 0,
    },
  })
  return data
}

export async function getSubscription(
  actorHref: string,
  opts: { skipErrorToast?: boolean } = {},
): Promise<ActorSubscription | null> {
  try {
    const { data } = await http.get<ActorSubscription>(
      `/api/subscriptions/actors/${encodeURIComponent(actorIdFromHref(actorHref))}`,
      { skipErrorToast: opts.skipErrorToast },
    )
    return data
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 404) return null
    throw err
  }
}

export async function upsertSubscription(
  actorHref: string,
  payload: { actor_name?: string | null; active?: boolean },
): Promise<ActorSubscription> {
  const { data } = await http.put<ActorSubscription>(
    `/api/subscriptions/actors/${encodeURIComponent(actorIdFromHref(actorHref))}`,
    payload,
  )
  return data
}

export async function deleteSubscription(actorHref: string): Promise<void> {
  await http.delete(
    `/api/subscriptions/actors/${encodeURIComponent(actorIdFromHref(actorHref))}`,
  )
}
