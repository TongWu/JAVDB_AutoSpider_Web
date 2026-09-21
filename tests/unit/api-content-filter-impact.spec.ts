import { beforeEach, describe, expect, it, vi } from 'vitest'

const postSpy = vi.fn()

vi.mock('@/api/client', () => ({
  http: {
    post: (...args: unknown[]) => postSpy(...args),
  },
}))

import { compareContentFilterImpact, type ContentFilterImpactRequest } from '@/api/content-filter'

describe('content-filter impact API client', () => {
  beforeEach(() => postSpy.mockReset())

  it('posts the observed baseline and draft only to the read-only impact route', async () => {
    const payload: ContentFilterImpactRequest = {
      baseline_version: 'sha256:baseline',
      draft_rules: [
        { id: null, dimension: 'gender', mode: 'exclude_all_male' },
      ],
    }
    const response = {
      baseline_identity: 'content-filter-rules',
      baseline_version: 'sha256:baseline',
      cohort_version: 'sha256:cohort',
      cohort_size: 500,
      page: 1,
      page_size: 100,
      total: 0,
      has_more: false,
      coverage: { total: 0, current_known: 0, draft_known: 0, both_known: 0 },
      summary: {
        current: { keep: 0, drop: 0, unknown: 0 },
        draft: { keep: 0, drop: 0, unknown: 0 },
        transitions: {},
        missing_metadata: {},
      },
      items: [],
    }
    postSpy.mockResolvedValueOnce({ data: response })

    const result = await compareContentFilterImpact(payload)

    expect(postSpy).toHaveBeenCalledWith('/api/content-filter/impact', payload)
    expect(result).toEqual(response)
  })
})
