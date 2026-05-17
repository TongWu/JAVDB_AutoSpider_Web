import { http } from './client'

export interface ParseUrlOpts {
  page_num?: number
  use_proxy?: boolean
  use_cf_bypass?: boolean
  use_cookie?: boolean
}

// `/api/parse/url` returns the gateway's `result.to_dict()` — currently a
// loose `Record<string, unknown>` shape on the BE. We deliberately keep the
// return type wide instead of inventing a structured one until BE tightens
// the response model.
export type ParseUrlResponse = Record<string, unknown>

export async function apiParseUrl(
  url: string,
  opts: ParseUrlOpts = {},
): Promise<ParseUrlResponse> {
  const { data } = await http.post<ParseUrlResponse>('/api/parse/url', {
    url,
    page_num: opts.page_num ?? 1,
    use_proxy: opts.use_proxy ?? true,
    use_cf_bypass: opts.use_cf_bypass ?? true,
    use_cookie: opts.use_cookie ?? false,
  })
  return data
}
