import { http } from './client'

export interface LogSearchItem {
  job_id: string
  line_number: number
  text: string
  kind: string
  created_at: string
}
export interface LogSearchResponse {
  results: LogSearchItem[]
  total_matched: number
  truncated: boolean
}
export interface LogSearchParams {
  q: string
  job_id?: string
  date_from?: string
  date_to?: string
  limit?: number
}

export async function searchLogs(params: LogSearchParams): Promise<LogSearchResponse> {
  const { data } = await http.get<LogSearchResponse>('/api/logs/search', { params })
  return data
}
