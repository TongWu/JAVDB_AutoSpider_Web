import { http } from './client'
import type { ResponseFor } from './_typed'

export type HealthResponse = ResponseFor<'/api/health', 'get'>

export async function apiHealth(): Promise<HealthResponse> {
  const { data } = await http.get<HealthResponse>('/api/health')
  return data
}
