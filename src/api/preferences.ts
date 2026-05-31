import axios from 'axios'
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

// Dimension link objects (maker, director, category) are `{name, href}` pairs;
// the backend JSON-decodes them from the MovieMetadata table. We only read
// `name` here, so the value type stays loose (mirrors api.gen MovieMetadataResponse).
export type DimensionLink = Record<string, string>

export interface MovieMetadata {
  href: string
  title: string | null
  video_code: string | null
  maker: DimensionLink | null
  directors: DimensionLink[] | null
  categories: DimensionLink[] | null
  [key: string]: unknown
}

// `href` is sent percent-encoded as a single path segment (the backend route
// param decodes it back to e.g. "/v/abc123").
export async function getMovieRating(href: string): Promise<MovieRating> {
  const { data } = await http.get<MovieRating>(
    `/api/preferences/movies/${encodeURIComponent(href)}/rating`,
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

// Movie metadata holds maker/director links that the resolve detail does not.
// A 404 is the normal "not scraped yet" case, so we return null (and opt out of
// the global error toast) instead of surfacing it as an error.
export async function getMovieMetadata(href: string): Promise<MovieMetadata | null> {
  try {
    const { data } = await http.get<MovieMetadata>(
      `/api/preferences/metadata/${encodeURIComponent(href)}`,
      { skipErrorToast: true },
    )
    return data
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 404) return null
    throw err
  }
}
