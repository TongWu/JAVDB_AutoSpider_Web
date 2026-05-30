import { describe, it, expect, vi } from 'vitest'
import { createRatingSaver } from '@/pages/data/rating-saver'
import type { RatingPayload } from '@/pages/data/rating-merge'
import type { MovieRating } from '@/api/preferences'

function row(href: string, over: Partial<MovieRating> = {}): MovieRating {
  return {
    href,
    video_code: 'X',
    rating: null,
    tags: [],
    notes: null,
    rated_at: null,
    updated_at: '',
    ...over,
  }
}

describe('createRatingSaver', () => {
  it('fetches the canonical row when missing from cache and preserves unloaded fields', async () => {
    // Regression: listMovieRatings is clamped to 200 server-side, so a >200-rating
    // user can edit a row absent from the cache. Without the fetch, merging over
    // `undefined` would blank the existing rating/notes via the full-replace upsert.
    const cache = new Map<string, MovieRating>()
    const fetchRating = vi.fn(async (href: string) => row(href, { rating: 4, notes: 'keep' }))
    const upsert = vi.fn(async (href: string, payload: RatingPayload) => row(href, payload))
    const save = createRatingSaver({
      getCached: (h) => cache.get(h),
      fetchRating,
      upsert,
      onSaved: (h, r) => cache.set(h, r),
      onError: vi.fn(),
    })

    await save('/v/a', { tags: ['plot_good'] })

    expect(fetchRating).toHaveBeenCalledWith('/v/a')
    expect(upsert).toHaveBeenCalledWith('/v/a', { rating: 4, tags: ['plot_good'], notes: 'keep' })
  })

  it('treats a 404 fetch as unrated (defaults) without surfacing an error', async () => {
    const fetchRating = vi.fn(async () => {
      throw new Error('404')
    })
    const upsert = vi.fn(async (href: string, payload: RatingPayload) => row(href, payload))
    const onError = vi.fn()
    const save = createRatingSaver({
      getCached: () => undefined,
      fetchRating,
      upsert,
      onSaved: vi.fn(),
      onError,
    })

    await save('/v/new', { notes: 'first' })

    expect(upsert).toHaveBeenCalledWith('/v/new', { rating: null, tags: [], notes: 'first' })
    expect(onError).not.toHaveBeenCalled()
  })

  it('does not fetch when the row is already cached', async () => {
    const cache = new Map<string, MovieRating>([['/v/a', row('/v/a', { rating: 5 })]])
    const fetchRating = vi.fn()
    const upsert = vi.fn(async (href: string, payload: RatingPayload) => row(href, payload))
    const save = createRatingSaver({
      getCached: (h) => cache.get(h),
      fetchRating,
      upsert,
      onSaved: () => {},
      onError: vi.fn(),
    })

    await save('/v/a', { tags: ['quality_high'] })

    expect(fetchRating).not.toHaveBeenCalled()
    expect(upsert).toHaveBeenCalledWith('/v/a', { rating: 5, tags: ['quality_high'], notes: null })
  })

  it('serializes same-href saves so a later edit merges over the earlier result', async () => {
    // Regression: tags then notes in the expand editor. The second save must see
    // the first save's stored tags, not the stale pre-save snapshot.
    const cache = new Map<string, MovieRating>([['/v/a', row('/v/a')]])
    let release1: (() => void) | null = null
    const upsert = vi
      .fn<(href: string, payload: RatingPayload) => Promise<MovieRating>>()
      .mockImplementationOnce(
        (href, payload) =>
          new Promise<MovieRating>((resolve) => {
            release1 = () => resolve(row(href, payload))
          }),
      )
      .mockImplementationOnce(async (href, payload) => row(href, payload))
    const save = createRatingSaver({
      getCached: (h) => cache.get(h),
      fetchRating: vi.fn(),
      upsert,
      onSaved: (h, r) => cache.set(h, r),
      onError: vi.fn(),
    })

    const p1 = save('/v/a', { tags: ['plot_good'] })
    const p2 = save('/v/a', { notes: 'hello' })
    // Flush pending microtasks so p1 reaches its (hanging) upsert call.
    await new Promise((resolve) => setTimeout(resolve, 0))

    // p2 is queued behind p1 — only the first upsert has fired so far.
    expect(upsert).toHaveBeenCalledTimes(1)

    release1!()
    await p1
    await p2

    // p2 merged over p1's stored row → both the tag and the note survive.
    expect(upsert).toHaveBeenNthCalledWith(2, '/v/a', {
      rating: null,
      tags: ['plot_good'],
      notes: 'hello',
    })
    expect(cache.get('/v/a')).toMatchObject({ tags: ['plot_good'], notes: 'hello' })
  })

  it('runs saves for different hrefs concurrently', async () => {
    const order: string[] = []
    const upsert = vi.fn(async (href: string, payload: RatingPayload) => {
      order.push(href)
      return row(href, payload)
    })
    const save = createRatingSaver({
      getCached: () => row('x'),
      fetchRating: vi.fn(),
      upsert,
      onSaved: () => {},
      onError: vi.fn(),
    })

    await Promise.all([save('/v/a', { rating: 1 }), save('/v/b', { rating: 2 })])

    expect(upsert).toHaveBeenCalledTimes(2)
    expect(order).toContain('/v/a')
    expect(order).toContain('/v/b')
  })
})
