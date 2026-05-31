import { describe, expect, it } from 'vitest'
import {
  leadActorHearted,
  reconcileHearted,
  resolvePreferenceScore,
} from '@/components/browse/resolve-preferences'
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

describe('reconcileHearted', () => {
  it('returns the snapshot verbatim when nothing is locked', () => {
    const snapshot = new Map([['Alice', true]])
    const result = reconcileHearted(snapshot, new Map(), new Set())
    expect([...result]).toEqual([['Alice', true]])
  })

  it('preserves a local toggle that the server snapshot has not caught up to', () => {
    // User hearted "Alice" before the prefs list returned; the snapshot predates
    // the click and still reports false — the local true must win.
    const snapshot = new Map([['Alice', false]])
    const current = new Map([['Alice', true]])
    const result = reconcileHearted(snapshot, current, new Set(['Alice']))
    expect(result.get('Alice')).toBe(true)
  })

  it('preserves a local un-heart (current missing the key → false)', () => {
    const snapshot = new Map([['Alice', true]])
    const result = reconcileHearted(snapshot, new Map(), new Set(['Alice']))
    expect(result.get('Alice')).toBe(false)
  })

  it('does not mutate the input snapshot', () => {
    const snapshot = new Map([['Alice', false]])
    reconcileHearted(snapshot, new Map([['Alice', true]]), new Set(['Alice']))
    expect(snapshot.get('Alice')).toBe(false)
  })

  it('keeps non-locked server entries untouched', () => {
    const snapshot = new Map([
      ['Alice', true],
      ['Bob', false],
    ])
    const current = new Map([['Bob', true]])
    const result = reconcileHearted(snapshot, current, new Set(['Bob']))
    expect(result.get('Alice')).toBe(true)
    expect(result.get('Bob')).toBe(true)
  })
})
