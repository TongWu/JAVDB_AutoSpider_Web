import { http } from './client'

export interface SpiderJobPayload {
  url?: string
  phase?: 'all' | '1' | '2'
  use_proxy?: boolean
  no_proxy?: boolean
  use_cf_bypass?: boolean | null
  use_cookie?: boolean
  ignore_history?: boolean
  ignore_release_date?: boolean
  max_movies_phase1?: number | null
  max_movies_phase2?: number | null
  enable_dedup?: boolean
  redownload_threshold?: number | null
  no_rclone_filter?: boolean
  disable_all_filters?: boolean
  dry_run?: boolean
}

export interface SpiderJobSubmitResponse {
  job_id?: string
  ok?: boolean
  [key: string]: unknown
}

export interface SpiderJobStatusResponse {
  status?: string
  progress?: unknown
  error?: string | null
  [key: string]: unknown
}

export async function apiSubmitSpiderJob(payload: SpiderJobPayload): Promise<SpiderJobSubmitResponse> {
  const { data } = await http.post<SpiderJobSubmitResponse>('/api/jobs/spider', payload)
  return data
}

export async function apiGetSpiderJobStatus(jobId: string): Promise<SpiderJobStatusResponse> {
  const { data } = await http.get<SpiderJobStatusResponse>(`/api/jobs/${jobId}/status`)
  return data
}
