import { http } from './client'
import type { components } from '@/types/api.gen'

export type VideoCodeSearchResponse = components['schemas']['VideoCodeSearchResponse']
export type ExploreResolveResponse = components['schemas']['ExploreResolveResponse']
export type ExploreIndexStatusResponse = components['schemas']['ExploreIndexStatusResponse']
export type ExploreIndexStatusItem = components['schemas']['ExploreIndexStatusItem']
export type ExploreOneClickResponse = components['schemas']['ExploreOneClickResponse']

export interface ExploreSearchByCodeOpts {
  use_proxy?: boolean
  use_cookie?: boolean
  f?: string
}

export async function apiSearchByVideoCode(
  videoCode: string,
  opts: ExploreSearchByCodeOpts = {},
): Promise<VideoCodeSearchResponse> {
  const { data } = await http.post<VideoCodeSearchResponse>('/api/explore/search-by-video-code', {
    video_code: videoCode,
    use_proxy: opts.use_proxy ?? true,
    use_cookie: opts.use_cookie ?? true,
    f: opts.f ?? 'all',
  })
  return data
}

export interface ExploreResolveOpts {
  page_num?: number
  use_proxy?: boolean
  use_cookie?: boolean
}

export async function apiResolve(
  url: string,
  opts: ExploreResolveOpts = {},
): Promise<ExploreResolveResponse> {
  const { data } = await http.post<ExploreResolveResponse>('/api/explore/resolve', {
    url,
    page_num: opts.page_num ?? 1,
    use_proxy: opts.use_proxy ?? true,
    use_cookie: opts.use_cookie ?? true,
  })
  return data
}

export interface IndexStatusInput {
  href: string
}

export async function apiIndexStatus(
  movies: IndexStatusInput[],
  opts: { use_proxy?: boolean; use_cookie?: boolean } = {},
): Promise<ExploreIndexStatusResponse> {
  const { data } = await http.post<ExploreIndexStatusResponse>('/api/explore/index-status', {
    movies: movies.map((m) => ({ href: m.href })),
    use_proxy: opts.use_proxy ?? true,
    use_cookie: opts.use_cookie ?? true,
  })
  return data
}

export async function apiDownloadMagnet(
  magnet: string,
  title = '',
  category: string | null = null,
): Promise<{ status: string }> {
  const { data } = await http.post<{ status: string }>('/api/explore/download-magnet', {
    magnet,
    title,
    category,
  })
  return data
}

export async function apiOneClick(
  detailUrl: string,
  opts: { use_proxy?: boolean; use_cookie?: boolean; category?: string | null } = {},
): Promise<ExploreOneClickResponse> {
  const { data } = await http.post<ExploreOneClickResponse>('/api/explore/one-click', {
    detail_url: detailUrl,
    use_proxy: opts.use_proxy ?? true,
    use_cookie: opts.use_cookie ?? true,
    category: opts.category ?? null,
  })
  return data
}

export async function apiSyncCookie(cookie: string): Promise<{ status: string }> {
  const { data } = await http.post<{ status: string }>('/api/explore/sync-cookie', { cookie })
  return data
}

export async function apiProxyPage(url: string): Promise<string> {
  const { data } = await http.get<string>('/api/explore/proxy-page', {
    params: { url },
    responseType: 'text',
    // The endpoint returns text/html, not JSON.
    transformResponse: [(d: string) => d],
  })
  return data
}

export interface AggregatedMagnet {
  magnet_uri: string
  name: string
  // Per the OpenAPI contract only magnet_uri + name are required; a valid
  // response may omit the rest, so they are optional here (see store mapping,
  // which defaults sources before joining).
  size?: string
  tags?: string[]
  file_count?: number
  info_hash?: string | null
  sources?: string[]
  quality_score?: number
  quality_reasons?: string[]
}

export interface AggregateMagnetsResponse {
  video_code: string
  magnets: AggregatedMagnet[]
}

export async function apiAggregateMagnets(
  videoCode: string,
): Promise<AggregateMagnetsResponse> {
  const { data } = await http.post<AggregateMagnetsResponse>(
    '/api/explore/aggregate-magnets',
    { video_code: videoCode },
    // The caller renders the failure inline (aggregateError alert), so opt out of
    // the global error toast to avoid a duplicate notification.
    { skipErrorToast: true },
  )
  return data
}
