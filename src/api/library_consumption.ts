import { http } from './client'
import type { components } from '@/types/api.gen'

export type ConsumptionSummary = components['schemas']['ConsumptionSummary']
export type ConsumptionRecentItem = components['schemas']['ConsumptionRecentItem']
export type ConsumptionTrendPoint = components['schemas']['ConsumptionTrendPoint']
export type UnresolvedItem = components['schemas']['UnresolvedItem']

export async function getConsumptionSummary(): Promise<ConsumptionSummary> {
  const { data } = await http.get<ConsumptionSummary>('/api/library/consumption/summary')
  return data
}

export async function getConsumptionRecent(
  params: { instance?: string | null; watched?: boolean | null; limit?: number; offset?: number } = {},
): Promise<ConsumptionRecentItem[]> {
  const { data } = await http.get<ConsumptionRecentItem[]>('/api/library/consumption/recent', {
    params: {
      instance: params.instance ?? undefined,
      // boolean → "true"/"false" string so axios does not omit false
      watched: params.watched == null ? undefined : String(params.watched),
      limit: params.limit ?? 50,
      offset: params.offset ?? 0,
    },
  })
  return data
}

export async function getConsumptionTrend(period = '30d'): Promise<ConsumptionTrendPoint[]> {
  const { data } = await http.get<ConsumptionTrendPoint[]>('/api/library/consumption/trend', {
    params: { period },
  })
  return data
}

export async function getConsumptionUnresolved(
  params: { instance?: string | null; limit?: number; offset?: number } = {},
): Promise<UnresolvedItem[]> {
  const { data } = await http.get<UnresolvedItem[]>('/api/library/consumption/unresolved', {
    params: {
      instance: params.instance ?? undefined,
      limit: params.limit ?? 50,
      offset: params.offset ?? 0,
    },
  })
  return data
}
