import { describe, expect, it } from 'vitest'
import { leadActorHearted, resolvePreferenceScore } from '@/components/browse/resolve-preferences'
import { computePreferenceScore } from '@/pages/data/preference-score'

describe('leadActorHearted', () => {
  it('returns false for an empty actor list', () => {
    expect(leadActorHearted([], new Map())).toBe(false)
  })

  it('returns true when the lead actor is hearted', () => {
    expect(leadActorHearted(['Alice'], new Map([['Alice', true]]))).toBe(true)
  })

  it('returns false when the lead actor is absent from the map', () => {
    expect(leadActorHearted(['Alice'], new Map())).toBe(false)
  })

  it('only considers the first actor', () => {
    // Second actor hearted, first not → false (lead actor drives the term).
    const map = new Map([['Bob', true]])
    expect(leadActorHearted(['Alice', 'Bob'], map)).toBe(false)
  })
})

describe('resolvePreferenceScore', () => {
  it('matches the unrated baseline with no hearted lead', () => {
    expect(resolvePreferenceScore(null, [], new Map())).toBeCloseTo(
      computePreferenceScore(null, false),
      5,
    )
  })

  it('matches a rated movie with a hearted lead actor', () => {
    const map = new Map([['Alice', true]])
    expect(resolvePreferenceScore(5, ['Alice'], map)).toBeCloseTo(
      computePreferenceScore(5, true),
      5,
    )
  })

  it('strictly increases when the lead actor becomes hearted at the same rating', () => {
    const actors = ['Alice']
    const notHearted = resolvePreferenceScore(3, actors, new Map())
    const hearted = resolvePreferenceScore(3, actors, new Map([['Alice', true]]))
    expect(hearted).toBeGreaterThan(notHearted)
  })
})
