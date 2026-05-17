import { http } from './client'

// --- Daily ---

// The generated DailyTaskPayload marks all defaults as required (openapi-typescript artefact).
// Use a hand-written partial interface for the fields we actually send; the backend fills the rest.
export interface DailyTaskPayload {
  start_page?: number
  end_page?: number
  use_proxy?: boolean
  no_proxy?: boolean
  dry_run?: boolean
}

export interface TriggerTaskResponse {
  ok?: boolean
  job_id?: string
  [key: string]: unknown
}

export async function apiTriggerDaily(payload: DailyTaskPayload): Promise<TriggerTaskResponse> {
  const { data } = await http.post<TriggerTaskResponse>('/api/tasks/daily', payload)
  return data
}

// --- Ad Hoc ---

export interface AdhocTaskPayload {
  url: string
  use_proxy?: boolean
  no_proxy?: boolean
  dry_run?: boolean
  ignore_release_date?: boolean
}

export async function apiTriggerAdhoc(payload: AdhocTaskPayload): Promise<TriggerTaskResponse> {
  const { data } = await http.post<TriggerTaskResponse>('/api/tasks/adhoc', payload)
  return data
}

// --- Task lookups ---

export interface TaskItem {
  job_id: string
  mode?: string
  status?: string
  started_at?: string
  ended_at?: string | null
  duration_seconds?: number | null
  [key: string]: unknown
}

export interface ListTasksResponse {
  tasks?: TaskItem[]
  items?: TaskItem[]  // some BE versions use 'items'
  total?: number
  [key: string]: unknown
}

export async function apiListTasks(limit = 200): Promise<ListTasksResponse> {
  const { data } = await http.get<ListTasksResponse>('/api/tasks', { params: { limit } })
  return data
}

export async function apiGetTask(jobId: string): Promise<TaskItem> {
  const { data } = await http.get<TaskItem>(`/api/tasks/${jobId}`)
  return data
}

// --- Streaming ---

export interface StreamChunk {
  offset?: number
  lines?: string[]
  log?: string  // some BE versions return raw text
  done?: boolean
  status?: string
  [key: string]: unknown
}

export async function apiGetTaskStream(jobId: string, offset = 0): Promise<StreamChunk> {
  const { data } = await http.get<StreamChunk>(`/api/tasks/${jobId}/stream`, {
    params: { offset },
  })
  return data
}
