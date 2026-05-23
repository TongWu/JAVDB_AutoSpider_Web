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

// ── Workflow Editor (tier: edit) ───────────────────────────────────
export interface WorkflowContentResponse {
  content: string
  sha: string
  path: string
}
export interface WorkflowUpdateRequest {
  content: string
  sha: string
  commit_message: string
  branch?: string
}
export interface WorkflowUpdateResponse {
  updated: boolean
  commit_sha: string
  validation_warnings: string[]
}

export async function getWorkflowContent(name: string): Promise<WorkflowContentResponse> {
  const { data } = await http.get<WorkflowContentResponse>(
    `/api/gh-actions/workflows/${encodeURIComponent(name)}`
  )
  return data
}

export async function updateWorkflow(
  name: string, body: WorkflowUpdateRequest
): Promise<WorkflowUpdateResponse> {
  const { data } = await http.put<WorkflowUpdateResponse>(
    `/api/gh-actions/workflows/${encodeURIComponent(name)}`, body
  )
  return data
}

// ── Secrets CRUD (tier: admin) ─────────────────────────────────────
export interface SecretItem {
  name: string
  created_at: string
  updated_at: string
}
export interface SecretsResponse {
  secrets: SecretItem[]
}
export interface CreateSecretRequest {
  name: string
  value: string
}
export interface CreateSecretResponse {
  created: boolean
}
export interface DeleteSecretResponse {
  deleted: boolean
}

export async function listSecrets(): Promise<SecretsResponse> {
  const { data } = await http.get<SecretsResponse>('/api/gh-actions/secrets')
  return data
}

export async function createOrUpdateSecret(body: CreateSecretRequest): Promise<CreateSecretResponse> {
  const { data } = await http.post<CreateSecretResponse>('/api/gh-actions/secrets', body)
  return data
}

export async function deleteSecret(name: string): Promise<DeleteSecretResponse> {
  const { data } = await http.delete<DeleteSecretResponse>(
    `/api/gh-actions/secrets/${encodeURIComponent(name)}`
  )
  return data
}
