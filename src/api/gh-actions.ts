import { http } from './client'

// ── Types ───────────────────────────────────────────────────────────
export interface RunItem {
  id: number
  name?: string
  display_title?: string
  status?: string
  conclusion?: string
  event?: string
  created_at?: string
  updated_at?: string
  head_sha?: string
  run_number?: number
}

export interface WorkflowItem {
  id: number
  name: string
  state?: string
  last_run?: RunItem
}

export interface WorkflowsResponse {
  workflows: WorkflowItem[]
}

export interface RunsResponse {
  runs: RunItem[]
}

export interface DispatchRequest {
  workflow_id: number
  ref?: string
  inputs?: Record<string, string>
}

export interface DispatchResponse {
  dispatched: boolean
}

export interface RunLogsResponse {
  logs_url: string
}

// ── API calls ───────────────────────────────────────────────────────
export async function listWorkflows(): Promise<WorkflowsResponse> {
  const { data } = await http.get<WorkflowsResponse>('/api/gh-actions/workflows')
  return data
}

export async function listRuns(workflowId: number): Promise<RunsResponse> {
  const { data } = await http.get<RunsResponse>('/api/gh-actions/runs', {
    params: { workflow: workflowId },
  })
  return data
}

export async function dispatchWorkflow(req: DispatchRequest): Promise<DispatchResponse> {
  const { data } = await http.post<DispatchResponse>('/api/gh-actions/runs', req)
  return data
}

export async function getRunLogs(runId: number): Promise<RunLogsResponse> {
  const { data } = await http.get<RunLogsResponse>(`/api/gh-actions/runs/${runId}/logs`)
  return data
}
