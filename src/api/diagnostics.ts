import { http } from './client'

// ── Deep health check ────────────────────────────────────────────────
export async function deepHealthCheck(): Promise<Record<string, unknown>> {
  const { data } = await http.post<Record<string, unknown>>('/api/health-check')
  return data
}

// ── JavDB session diagnostics ────────────────────────────────────────
export interface JavdbSessionStatus {
  cookie_present: boolean
  cookie_value_preview?: string
  last_refresh_time?: string
  estimated_expiry?: string
  is_likely_valid: boolean
}

export interface JavdbSessionRefreshRequest {
  method: 'headless' | 'cookie_paste'
  cookie_value?: string
}

export interface JavdbSessionRefreshResponse {
  success: boolean
  method: string
  new_cookie_preview?: string
  error?: string
}

export async function getJavdbSession(): Promise<JavdbSessionStatus> {
  const { data } = await http.get<JavdbSessionStatus>('/api/diag/javdb-session')
  return data
}

export async function refreshJavdbSession(
  req: JavdbSessionRefreshRequest,
): Promise<JavdbSessionRefreshResponse> {
  const { data } = await http.post<JavdbSessionRefreshResponse>(
    '/api/diag/javdb-session/refresh',
    req,
  )
  return data
}

// ── HTML parse endpoints ─────────────────────────────────────────────
export type ParseType = 'index' | 'detail' | 'category' | 'top' | 'tags'

export async function parseHtml(
  type: ParseType,
  html: string,
): Promise<Record<string, unknown>> {
  const { data } = await http.post<Record<string, unknown>>(`/api/parse/${type}`, { html })
  return data
}

export async function detectPageType(html: string): Promise<{ page_type: string }> {
  const { data } = await http.post<{ page_type: string }>('/api/detect-page-type', { html })
  return data
}

// ── Login refresh (headless re-login) ────────────────────────────────
export async function loginRefresh(): Promise<Record<string, unknown>> {
  const { data } = await http.post<Record<string, unknown>>('/api/login/refresh')
  return data
}

// ── Ops Incidents ─────────────────────────────────────────────────────
export interface EvidenceRef {
  kind: string
  ref: string
  label?: string | null
}

export interface OpsIncident {
  incident_id: string
  trigger_source: string
  run_id?: string | null
  run_attempt?: number | null
  session_id?: string | null
  incident_type: string
  status: string
  persistence_status: string
  model_version: string
  detector_version: string
  confidence: string
  confirmed_findings: string[]
  likely_causes: string[]
  unknowns: string[]
  recommended_next_actions: string[]
  unsafe_actions: string[]
  evidence_refs: EvidenceRef[]
  created_at: string
  updated_at: string
  resolved_at?: string | null
}

export interface OpsIncidentListResponse {
  items: OpsIncident[]
}

export interface OpsIncidentAnalytics {
  total: number
  by_type: Record<string, number>
  by_status: Record<string, number>
  by_confidence: Record<string, number>
  open_high_confidence: number
}

export interface ListOpsIncidentParams {
  status?: string
  incident_type?: string
  confidence?: string
  run_id?: string
  session_id?: string
}

export async function listOpsIncidents(params: ListOpsIncidentParams = {}): Promise<OpsIncidentListResponse> {
  const { data } = await http.get<OpsIncidentListResponse>('/api/diag/ops-incidents', { params })
  return data
}

// Part of the API contract; the detail drawer currently populates from in-memory list data,
// but this endpoint is available for future on-demand detail-fetch use.
export async function getOpsIncident(incidentId: string): Promise<OpsIncident> {
  const { data } = await http.get<OpsIncident>(`/api/diag/ops-incidents/${incidentId}`)
  return data
}

export async function getOpsIncidentAnalytics(): Promise<OpsIncidentAnalytics> {
  const { data } = await http.get<OpsIncidentAnalytics>('/api/diag/ops-incidents/analytics')
  return data
}

// ── Ops Remediation Proposals ─────────────────────────────────────────
// Narrow the two most drift-prone fields to the exact backend literals so the
// compiler catches enum typos (the safe_to_prepare/expired mismatch slipped
// through precisely because these were plain `string`).
export type OpsRemediationStatus = 'proposed' | 'approved' | 'rejected' | 'expired'
export type OpsRemediationSafetyLevel = 'safe_to_prepare' | 'requires_review' | 'blocked'

export interface OpsRemediationProposal {
  proposal_id: string
  incident_id: string
  action_type: string
  status: OpsRemediationStatus
  safety_level: OpsRemediationSafetyLevel
  title: string
  rationale: string
  command_preview?: string | null
  runbook_ref?: string | null
  evidence_refs: EvidenceRef[]
  required_checks: string[]
  blocked_reasons: string[]
  proposed_by: string
  decided_by?: string | null
  decision_note?: string | null
  created_at: string
  updated_at: string
  decided_at?: string | null
}

export interface OpsRemediationProposalListResponse {
  items: OpsRemediationProposal[]
}

export interface RemediationDecisionRequest {
  status: 'approved' | 'rejected'
  decision_note?: string | null
}

export async function listRemediationProposals(incidentId: string): Promise<OpsRemediationProposalListResponse> {
  const { data } = await http.get<OpsRemediationProposalListResponse>(`/api/diag/ops-incidents/${incidentId}/remediation-proposals`)
  return data
}

export async function decideRemediationProposal(proposalId: string, body: RemediationDecisionRequest): Promise<OpsRemediationProposal> {
  const { data } = await http.post<OpsRemediationProposal>(`/api/diag/remediation-proposals/${proposalId}/decision`, body)
  return data
}
