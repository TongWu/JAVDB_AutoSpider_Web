import { http } from './client'
import type { components } from '@/types/api.gen'

export type SessionItem = components['schemas']['SessionItem']
export type SessionListResponse = components['schemas']['SessionListResponse']
export type SessionDetailResponse = components['schemas']['SessionDetailResponse']
export type SessionRollbackPayload = components['schemas']['SessionRollbackPayload']
export type SessionRollbackResponse = components['schemas']['SessionRollbackResponse']
export type SessionCommitPayload = components['schemas']['SessionCommitPayload']
export type SessionCommitResponse = components['schemas']['SessionCommitResponse']

export interface ListSessionsParams {
  state?: string
  cursor?: string
  limit?: number
}

export async function apiListSessions(
  params: ListSessionsParams = {},
): Promise<SessionListResponse> {
  const { data } = await http.get<SessionListResponse>('/api/sessions', { params })
  return data
}

export async function apiGetSession(sessionId: string): Promise<SessionDetailResponse> {
  const { data } = await http.get<SessionDetailResponse>(
    `/api/sessions/${encodeURIComponent(sessionId)}`,
  )
  return data
}

export async function apiRollbackSession(
  sessionId: string,
  payload: Partial<SessionRollbackPayload> = {},
): Promise<SessionRollbackResponse> {
  const body: SessionRollbackPayload = {
    dry_run: payload.dry_run ?? true,
    include_pending: payload.include_pending ?? true,
    restore_from_audit: payload.restore_from_audit ?? true,
  }
  const { data } = await http.post<SessionRollbackResponse>(
    `/api/sessions/${encodeURIComponent(sessionId)}/rollback`,
    body,
  )
  return data
}

export async function apiCommitSession(
  sessionId: string,
  payload: Partial<SessionCommitPayload> = {},
): Promise<SessionCommitResponse> {
  const body: SessionCommitPayload = {
    force: payload.force ?? false,
    drop_pending: payload.drop_pending ?? false,
    emit_metrics: payload.emit_metrics ?? true,
    fanout_claims: payload.fanout_claims ?? true,
  }
  const { data } = await http.post<SessionCommitResponse>(
    `/api/sessions/${encodeURIComponent(sessionId)}/commit`,
    body,
  )
  return data
}
