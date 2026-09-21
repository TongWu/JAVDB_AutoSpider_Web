import { http } from './client'
import type { components } from '@/types/api.gen'

// Hand-typed (mirrors src/api/watchlist.ts: shared `http` wrapper). Shapes mirror
// server/routes/content-filter.ts and apps/api/routers/content_filter.py.

export interface ContentFilterRule {
  id: number
  dimension: string
  mode: string
  value: string
  enabled: boolean
}

export interface ContentFilterRuleListResponse {
  items: ContentFilterRule[]
  total: number
  baseline_identity: string
  baseline_version: string
}

export type ContentFilterDraftRule = components['schemas']['ContentFilterDraftRule']
export type ContentFilterImpactRequest = components['schemas']['ContentFilterImpactRequest']
export type ContentFilterImpactResponse = components['schemas']['ContentFilterImpactResponse']
export type ContentFilterImpactItem = components['schemas']['ContentFilterImpactItem']

export async function listContentFilterRules(): Promise<ContentFilterRuleListResponse> {
  const { data } = await http.get<ContentFilterRuleListResponse>('/api/content-filter')
  return data
}

export async function addContentFilterRule(payload: {
  dimension: string
  mode: string
  value?: string
}): Promise<ContentFilterRule> {
  const { data } = await http.post<ContentFilterRule>('/api/content-filter', payload)
  return data
}

export async function setContentFilterRuleEnabled(
  id: number,
  enabled: boolean,
): Promise<ContentFilterRule> {
  const { data } = await http.put<ContentFilterRule>(`/api/content-filter/${id}`, { enabled })
  return data
}

export async function deleteContentFilterRule(id: number): Promise<void> {
  await http.delete(`/api/content-filter/${id}`)
}

export async function compareContentFilterImpact(
  payload: ContentFilterImpactRequest,
): Promise<ContentFilterImpactResponse> {
  const { data } = await http.post<ContentFilterImpactResponse>(
    '/api/content-filter/impact',
    payload,
  )
  return data
}
