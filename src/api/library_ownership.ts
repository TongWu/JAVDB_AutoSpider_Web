import { http } from './client'
import type { components } from '@/types/api.gen'

export type OwnershipSummary = components['schemas']['OwnershipSummary']
export type OwnershipSourceBreakdown = components['schemas']['OwnershipSourceBreakdown']
export type OwnershipRecentItem = components['schemas']['OwnershipRecentItem']

export async function getOwnershipSummary(): Promise<OwnershipSummary> {
  const { data } = await http.get<OwnershipSummary>('/api/library/ownership/summary')
  return data
}

export async function getOwnershipRecent(
  params: { source?: string | null; limit?: number; offset?: number } = {},
): Promise<OwnershipRecentItem[]> {
  const { data } = await http.get<OwnershipRecentItem[]>('/api/library/ownership/recent', {
    params: {
      source: params.source ?? undefined,
      limit: params.limit ?? 50,
      offset: params.offset ?? 0,
    },
  })
  return data
}
