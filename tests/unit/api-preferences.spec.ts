import { beforeEach, describe, expect, it, vi } from 'vitest'

const getSpy = vi.fn()
const putSpy = vi.fn()

vi.mock('@/api/client', () => ({
  http: {
    get: (...args: unknown[]) => getSpy(...args),
    put: (...args: unknown[]) => putSpy(...args),
  },
}))

import {
  listContentPreferences,
  upsertContentPreference,
  upsertMovieRating,
} from '@/api/preferences'

describe('preferences API client — path building', () => {
  beforeEach(() => {
    getSpy.mockReset()
    putSpy.mockReset()
  })

  it('upsertMovieRating percent-encodes the href slash into one segment', async () => {
    const body = { href: '/v/abc', video_code: 'ABC-1', rating: 4 }
    putSpy.mockResolvedValueOnce({ data: body })

    const res = await upsertMovieRating('/v/abc', { rating: 4 })

    expect(putSpy).toHaveBeenCalledTimes(1)
    expect(putSpy).toHaveBeenCalledWith(
      '/api/preferences/movies/%2Fv%2Fabc/rating',
      { rating: 4 },
    )
    expect(res).toEqual(body)
  })

  it('upsertContentPreference percent-encodes the contentId slash into one segment', async () => {
    const body = { content_type: 'actor', content_id: '/actors/xyz', content_name: 'X', hearted: true }
    putSpy.mockResolvedValueOnce({ data: body })

    const res = await upsertContentPreference('actor', '/actors/xyz', {
      content_name: 'X',
      hearted: true,
    })

    expect(putSpy).toHaveBeenCalledTimes(1)
    expect(putSpy).toHaveBeenCalledWith(
      '/api/preferences/actor/%2Factors%2Fxyz',
      { content_name: 'X', hearted: true },
    )
    expect(res).toEqual(body)
  })

  it('listContentPreferences hits /api/preferences (no trailing slash) with params', async () => {
    getSpy.mockResolvedValueOnce({ data: { items: [] } })

    const res = await listContentPreferences({ content_type: 'actor', hearted_only: true })

    expect(getSpy).toHaveBeenCalledTimes(1)
    expect(getSpy).toHaveBeenCalledWith('/api/preferences', {
      params: { content_type: 'actor', hearted_only: true },
    })
    expect(res).toEqual({ items: [] })
  })
})
