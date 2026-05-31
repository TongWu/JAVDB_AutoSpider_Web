import { describe, expect, it } from 'vitest'
import { mergeRating } from '@/pages/data/rating-merge'
import type { MovieRating } from '@/api/preferences'

// ADR-022 §C1: the backend rating upsert is a full-replace, so a single-field
// edit must carry the other fields forward or it wipes them.
const current: MovieRating = {
  href: '/v/abc123',
  video_code: 'ABC-123',
  rating: 4,
  tags: ['plot_good', 'keep_long_term'],
  notes: 'great encode',
  rated_at: '2026-05-01T00:00:00Z',
  updated_at: '2026-05-01T00:00:00Z',
}

describe('mergeRating', () => {
  it('preserves rating and notes when patching only tags', () => {
    expect(mergeRating(current, { tags: ['delete_candidate'] })).toEqual({
      rating: 4,
      tags: ['delete_candidate'],
      notes: 'great encode',
    })
  })

  it('preserves tags and notes when patching only rating', () => {
    expect(mergeRating(current, { rating: 2 })).toEqual({
      rating: 2,
      tags: ['plot_good', 'keep_long_term'],
      notes: 'great encode',
    })
  })

  it('preserves rating and tags when patching only notes', () => {
    expect(mergeRating(current, { notes: 'updated note' })).toEqual({
      rating: 4,
      tags: ['plot_good', 'keep_long_term'],
      notes: 'updated note',
    })
  })

  it('yields defaults merged with the patch when current is undefined', () => {
    expect(mergeRating(undefined, { rating: 3 })).toEqual({
      rating: 3,
      tags: [],
      notes: null,
    })
  })

  it('clears the rating when the patch carries an explicit null', () => {
    expect(mergeRating(current, { rating: null })).toEqual({
      rating: null,
      tags: ['plot_good', 'keep_long_term'],
      notes: 'great encode',
    })
  })
})
