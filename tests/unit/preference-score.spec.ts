import { describe, expect, it } from 'vitest'
import { computePreferenceScore } from '@/pages/data/preference-score'

// ADR-022 §B3: score = rating/5*0.5 + (hearted?1:0.5)*0.3 + 0.5*0.2
describe('computePreferenceScore', () => {
  it('returns max for a 5-star rating with a hearted actor', () => {
    // 1.0*0.5 + 1.0*0.3 + 0.1 = 0.9
    expect(computePreferenceScore(5, true)).toBeCloseTo(0.9, 5)
  })

  it('treats an unrated movie as 0 for the rating term', () => {
    // 0 + 0.5*0.3 + 0.1 = 0.25
    expect(computePreferenceScore(null, false)).toBeCloseTo(0.25, 5)
  })

  it('uses 0.5 actor weight when the actor is not hearted', () => {
    // 3/5*0.5 + 0.5*0.3 + 0.1 = 0.3 + 0.15 + 0.1 = 0.55
    expect(computePreferenceScore(3, false)).toBeCloseTo(0.55, 5)
  })

  it('adds the hearted-actor bonus over the unrated baseline', () => {
    // 0 + 1.0*0.3 + 0.1 = 0.4
    expect(computePreferenceScore(null, true)).toBeCloseTo(0.4, 5)
  })

  it('keeps the score within [0, 1]', () => {
    for (const rating of [null, 1, 2, 3, 4, 5]) {
      for (const hearted of [true, false]) {
        const s = computePreferenceScore(rating, hearted)
        expect(s).toBeGreaterThanOrEqual(0)
        expect(s).toBeLessThanOrEqual(1)
      }
    }
  })
})
