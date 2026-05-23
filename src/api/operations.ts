import { http } from './client'
import type { components } from '@/types/api.gen'

// ── qBittorrent ──────────────────────────────────────────────────────
export type QbTorrentItem = components['schemas']['QbTorrentItem']
export type QbTorrentsResponse = components['schemas']['QbTorrentsResponse']
export type QbFilterSmallRequest = components['schemas']['QbFilterSmallRequest']
export type QbFilterSmallResponse = components['schemas']['QbFilterSmallResponse']

export async function getQbTorrents(): Promise<QbTorrentsResponse> {
  const { data } = await http.get<QbTorrentsResponse>('/api/ops/qb/torrents')
  return data
}

export async function filterSmallFiles(
  req: Partial<QbFilterSmallRequest> = {},
): Promise<QbFilterSmallResponse> {
  const { data } = await http.post<QbFilterSmallResponse>('/api/ops/qb/filter-small', req)
  return data
}

// ── PikPak ───────────────────────────────────────────────────────────
export type PikPakQueueItem = components['schemas']['PikPakQueueItem']
export type PikPakQueueResponse = components['schemas']['PikPakQueueResponse']
export type PikPakTransferRequest = components['schemas']['PikPakTransferRequest']
export type PikPakTransferResponse = components['schemas']['PikPakTransferResponse']

export interface PikPakQueueParams {
  limit?: number
  cursor?: string | null
}

export async function getPikPakQueue(
  params: PikPakQueueParams = {},
): Promise<PikPakQueueResponse> {
  const { data } = await http.get<PikPakQueueResponse>('/api/ops/pikpak/queue', { params })
  return data
}

export async function transferPikPak(
  req: Partial<PikPakTransferRequest> = {},
): Promise<PikPakTransferResponse> {
  const { data } = await http.post<PikPakTransferResponse>('/api/ops/pikpak/transfer', req)
  return data
}

// ── Rclone ───────────────────────────────────────────────────────────
export type RcloneLastResponse = components['schemas']['RcloneLastResponse']
export type RcloneRunRequest = components['schemas']['RcloneRunRequest']
export type RcloneRunResponse = components['schemas']['RcloneRunResponse']

export async function getRcloneLast(): Promise<RcloneLastResponse> {
  const { data } = await http.get<RcloneLastResponse>('/api/ops/rclone/last')
  return data
}

export async function runRclone(
  req: Partial<RcloneRunRequest> = {},
): Promise<RcloneRunResponse> {
  const { data } = await http.post<RcloneRunResponse>('/api/ops/rclone/run', req)
  return data
}

// ── Email ────────────────────────────────────────────────────────────
export type EmailHistoryItem = components['schemas']['EmailHistoryItem']
export type EmailHistoryResponse = components['schemas']['EmailHistoryResponse']
export type EmailTestRequest = components['schemas']['EmailTestRequest']

export interface EmailTestResponse {
  success: boolean
  message: string
}

export interface EmailResendResponse {
  success: boolean
  message: string
}

export interface EmailHistoryParams {
  status?: string | null
  cursor?: string | null
  limit?: number
}

export async function sendTestEmail(
  req: Partial<EmailTestRequest> = {},
): Promise<EmailTestResponse> {
  const { data } = await http.post<EmailTestResponse>('/api/ops/email/test', req)
  return data
}

export async function getEmailHistory(
  params: EmailHistoryParams = {},
): Promise<EmailHistoryResponse> {
  const { data } = await http.get<EmailHistoryResponse>('/api/ops/email/history', { params })
  return data
}

export async function resendEmail(recordId: number): Promise<EmailResendResponse> {
  const { data } = await http.post<EmailResendResponse>(`/api/ops/email/${recordId}/resend`)
  return data
}

// ── Cleanup ──────────────────────────────────────────────────────────
export type CleanupStaleRequest = components['schemas']['CleanupStaleRequest']
export type CleanupStaleResponse = components['schemas']['CleanupStaleResponse']
export type CleanupClaimStagesRequest = components['schemas']['CleanupClaimStagesRequest']
export type CleanupClaimStagesResponse = components['schemas']['CleanupClaimStagesResponse']

export async function cleanupStaleSessions(
  req: Partial<CleanupStaleRequest> = {},
): Promise<CleanupStaleResponse> {
  const { data } = await http.post<CleanupStaleResponse>('/api/ops/cleanup/stale-sessions', req)
  return data
}

export async function cleanupClaimStages(
  req: Partial<CleanupClaimStagesRequest> = {},
): Promise<CleanupClaimStagesResponse> {
  const { data } = await http.post<CleanupClaimStagesResponse>('/api/ops/cleanup/claim-stages', req)
  return data
}
