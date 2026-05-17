import { http } from './client'
import type { ResponseFor } from './_typed'

// The generated DailyTaskPayload marks all defaults as required (openapi-typescript artefact).
// Use a hand-written partial interface for the fields we actually send; the backend fills the rest.
export interface DailyTaskPayload {
  start_page?: number
  end_page?: number
  use_proxy?: boolean | null
  dry_run?: boolean
}

export type TriggerTaskResponse = ResponseFor<'/api/tasks/daily', 'post'>

export async function apiTriggerDaily(payload: DailyTaskPayload): Promise<TriggerTaskResponse> {
  const { data } = await http.post<TriggerTaskResponse>('/api/tasks/daily', payload)
  return data
}
