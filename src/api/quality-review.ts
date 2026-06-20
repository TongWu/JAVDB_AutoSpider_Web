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
export type QualityRecommendation = components['schemas']['QualityRecommendationSchema']
export type QualityRecommendationList =
  components['schemas']['QualityRecommendationListResponse']
export type ReviewLabelRequest = components['schemas']['ReviewLabelRequest']
export type ReviewLabelResponse = components['schemas']['ReviewLabelResponse']
export type ReviewLabel = ReviewLabelRequest['label']

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

// Per-category current-vs-recommended candidates + reason diff for one movie. The
// drawer renders this inline (404/empty is an expected "not yet scored" state), so
// the global error toast is suppressed and the caller handles failures itself.
export async function listQualityRecommendations(
  movieHref: string,
): Promise<QualityRecommendationList> {
  const { data } = await http.get<QualityRecommendationList>('/api/quality/recommendations', {
    params: { movie_href: movieHref },
    skipErrorToast: true,
  })
  return data
}

// Record an operator accept/reject/skip label. The http client injects the CSRF
// token for mutations. Throws on validation / auth errors (the caller surfaces the
// message inline rather than via the global toast).
export async function submitReviewLabel(body: ReviewLabelRequest): Promise<ReviewLabelResponse> {
  const { data } = await http.post<ReviewLabelResponse>('/api/quality/review-labels', body, {
    skipErrorToast: true,
  })
  return data
}
