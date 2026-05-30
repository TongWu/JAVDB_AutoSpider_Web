import { http } from './client'

// Hand-typed until the openapi.json snapshot (and src/types/api.gen.ts) is
// regenerated to include the ADR-022 preferences endpoints. Shapes mirror the
// backend response transforms in server/routes/preferences.ts.

export interface MovieRating {
  href: string
  video_code: string
  rating: number | null
  tags: string[]
  notes: string | null
  rated_at: string | null
  updated_at: string
}

export interface MovieRatingListResponse {
  items: MovieRating[]
  total: number
}

export interface ContentPreference {
  content_type: string
  content_id: string
  content_name: string
  hearted: boolean
  weight: number
  updated_at: string
}

export interface ContentPreferenceListResponse {
  items: ContentPreference[]
}

// `href` is sent percent-encoded as a single path segment (the backend route
// param decodes it back to e.g. "/v/abc123").
export async function getMovieRating(
  href: string,
  opts: { skipErrorToast?: boolean } = {},
): Promise<MovieRating> {
  const { data } = await http.get<MovieRating>(
    `/api/preferences/movies/${encodeURIComponent(href)}/rating`,
    { skipErrorToast: opts.skipErrorToast },
  )
  return data
}

export async function upsertMovieRating(
  href: string,
  payload: { rating?: number | null; tags?: string[]; notes?: string | null },
): Promise<MovieRating> {
  const { data } = await http.put<MovieRating>(
    `/api/preferences/movies/${encodeURIComponent(href)}/rating`,
    payload,
  )
  return data
}

export async function listMovieRatings(
  params: { limit?: number; offset?: number } = {},
): Promise<MovieRatingListResponse> {
  const { data } = await http.get<MovieRatingListResponse>(
    '/api/preferences/movies/ratings',
    { params },
  )
  return data
}

export async function upsertContentPreference(
  contentType: string,
  contentId: string,
  payload: { content_name: string; hearted: boolean; weight?: number },
): Promise<ContentPreference> {
  const { data } = await http.put<ContentPreference>(
    `/api/preferences/${contentType}/${encodeURIComponent(contentId)}`,
    payload,
  )
  return data
}

// NOTE: no trailing slash — Hono serves the list at `/api/preferences`; the
// trailing-slash form 404s. Query params go through axios `{ params }`.
export async function listContentPreferences(
  params: { content_type?: string; hearted_only?: boolean } = {},
): Promise<ContentPreferenceListResponse> {
  const { data } = await http.get<ContentPreferenceListResponse>(
    '/api/preferences',
    { params },
  )
  return data
}
