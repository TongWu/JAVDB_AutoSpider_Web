import { http } from './client'
import type { components } from '@/types/api.gen'

export type MovieSearchItem = components['schemas']['MovieSearchItem']
export type MovieSearchResponse = components['schemas']['MovieSearchResponse']
export type TorrentSearchItem = components['schemas']['TorrentSearchItem']
export type TorrentSearchResponse = components['schemas']['TorrentSearchResponse']

export interface MovieSearchParams {
  q?: string
  actor?: string
  perfect_match?: boolean
  hi_res?: boolean
  session_id?: string
  date_from?: string
  date_to?: string
  cursor?: string
  limit?: number
}

export interface TorrentSearchParams {
  q?: string
  resolution_type?: number
  has_subtitle?: boolean
  uncensored?: boolean
  session_id?: string
  date_from?: string
  date_to?: string
  cursor?: string
  limit?: number
}

export async function searchMovies(
  params: MovieSearchParams = {},
): Promise<MovieSearchResponse> {
  const { data } = await http.get<MovieSearchResponse>('/api/history/movies', { params })
  return data
}

export async function exportMoviesCsv(
  params: MovieSearchParams = {},
): Promise<Blob> {
  const { data } = await http.get<Blob>('/api/history/movies/export', {
    params,
    responseType: 'blob',
  })
  return data
}

export async function searchTorrents(
  params: TorrentSearchParams = {},
): Promise<TorrentSearchResponse> {
  const { data } = await http.get<TorrentSearchResponse>('/api/history/torrents', { params })
  return data
}

export async function exportTorrentsCsv(
  params: TorrentSearchParams = {},
): Promise<Blob> {
  const { data } = await http.get<Blob>('/api/history/torrents/export', {
    params,
    responseType: 'blob',
  })
  return data
}
