import { http } from './client'
import type { components } from '@/types/api.gen'

export type AcquisitionSummary = components['schemas']['AcquisitionSummary']
export type AcquisitionRecentItem = components['schemas']['AcquisitionRecentItem']
export type AcquisitionTrendPoint = components['schemas']['AcquisitionTrendPoint']

export async function getAcquisitionSummary(): Promise<AcquisitionSummary> {
  const { data } = await http.get<AcquisitionSummary>('/api/library/acquisition/summary')
  return data
}

export async function getAcquisitionRecent(
  params: { state?: string | null; limit?: number; offset?: number } = {},
): Promise<AcquisitionRecentItem[]> {
  const { data } = await http.get<AcquisitionRecentItem[]>('/api/library/acquisition/recent', {
    params: {
      // null → undefined so axios omits the query param entirely
      state: params.state ?? undefined,
      limit: params.limit ?? 50,
      offset: params.offset ?? 0,
    },
  })
  return data
}

export async function getAcquisitionTrend(period = '30d'): Promise<AcquisitionTrendPoint[]> {
  const { data } = await http.get<AcquisitionTrendPoint[]>('/api/library/acquisition/trend', {
    params: { period },
  })
  return data
}
