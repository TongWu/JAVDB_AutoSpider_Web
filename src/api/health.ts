import { http } from './client'

export interface HealthResponse {
  status: string
  rust_core_available: boolean
  [key: string]: unknown
}

export async function apiHealth(): Promise<HealthResponse> {
  const { data } = await http.get<HealthResponse>('/api/health')
  return data
}
