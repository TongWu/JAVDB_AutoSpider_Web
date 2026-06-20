// Torrent quality review API client (ADR-024 Phase 2, read-only).
//
// Mirrors the TS backend server/routes/quality.ts, which itself mirrors the
// Python apps/api/routers/quality.py. Types are pulled from the generated
// OpenAPI schemas (vendored in src/types/api.gen.ts) so the response shapes stay
// contract-locked — do NOT hand-edit those types.
import { http } from './client'
import type { components } from '@/types/api.gen'

export type TorrentQualityEvaluation = components['schemas']['TorrentQualityEvaluationSchema']
export type TorrentQualityEvidence = components['schemas']['TorrentQualityEvidenceSchema']
export type TorrentQualityEvaluationList =
  components['schemas']['TorrentQualityEvaluationListResponse']

export interface ListEvaluationsParams {
  // Capped server-side at 200; ignored when movie_href is provided.
  limit?: number
  // When set, returns all evaluations for that movie ordered by shadow_rank ASC.
  movie_href?: string | null
}

export async function listQualityEvaluations(
  params: ListEvaluationsParams = {},
): Promise<TorrentQualityEvaluationList> {
  const { data } = await http.get<TorrentQualityEvaluationList>('/api/quality/evaluations', {
    params,
  })
  return data
}

// Production-download evidence for one torrent. The backend normalizes info_hash
// (trim + lowercase) and pins probe_schema_version / target_role. Throws (404)
// when no production-download evidence exists for the hash — an expected state
// (most torrents are not yet probed), so the global error toast is suppressed and
// the caller renders the missing-evidence case inline.
export async function getQualityEvidence(infoHash: string): Promise<TorrentQualityEvidence> {
  const { data } = await http.get<TorrentQualityEvidence>(
    `/api/quality/evidence/${encodeURIComponent(infoHash)}`,
    { skipErrorToast: true },
  )
  return data
}
