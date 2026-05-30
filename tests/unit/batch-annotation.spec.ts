import { describe, expect, it } from 'vitest'
import { reduceBatchKey } from '@/pages/data/batch-annotation'

const state = (focusedIndex: number, pendingRating: number | null = null) => ({
  focusedIndex,
  pendingRating,
})

describe('reduceBatchKey', () => {
  it('ignores keys outside the annotation shortcuts', () => {
    expect(reduceBatchKey('x', state(0), 10)).toBeNull()
    expect(reduceBatchKey('a', state(0), 10)).toBeNull()
  })

  it('j advances the focus, clamped to the last index', () => {
    expect(reduceBatchKey('j', state(0), 3)?.state.focusedIndex).toBe(1)
    expect(reduceBatchKey('j', state(2), 3)?.state.focusedIndex).toBe(2) // clamped at last
  })

  it('k retreats the focus, clamped to 0', () => {
    expect(reduceBatchKey('k', state(1), 3)?.state.focusedIndex).toBe(0)
    expect(reduceBatchKey('k', state(0), 3)?.state.focusedIndex).toBe(0) // clamped at 0
  })

  it('1-5 set the pending rating without moving focus or saving', () => {
    for (const key of ['1', '2', '3', '4', '5']) {
      const r = reduceBatchKey(key, state(1), 3)
      expect(r?.state.pendingRating).toBe(Number(key))
      expect(r?.state.focusedIndex).toBe(1)
      expect(r?.save).toBeNull()
    }
  })

  it('Enter saves the focused row when a rating is pending, then advances and clears', () => {
    const r = reduceBatchKey('Enter', state(1, 4), 3)
    expect(r?.save).toEqual({ index: 1, rating: 4 })
    expect(r?.state.focusedIndex).toBe(2)
    expect(r?.state.pendingRating).toBeNull()
  })

  it('Enter does not save when no rating is pending', () => {
    const r = reduceBatchKey('Enter', state(1, null), 3)
    expect(r?.save).toBeNull()
    expect(r?.state.focusedIndex).toBe(2)
  })

  it('Enter does not save when the focused index is out of range', () => {
    // empty list: lastIndex = -1, focusedIndex 0 is out of range
    const r = reduceBatchKey('Enter', state(0, 5), 0)
    expect(r?.save).toBeNull()
  })

  it('Space advances and requests preventDefault (page-scroll guard)', () => {
    const r = reduceBatchKey(' ', state(0), 3)
    expect(r?.state.focusedIndex).toBe(1)
    expect(r?.save).toBeNull()
    expect(r?.preventDefault).toBe(true)
  })

  it('only Space requests preventDefault', () => {
    expect(reduceBatchKey('j', state(0), 3)?.preventDefault).toBe(false)
    expect(reduceBatchKey('Enter', state(0, 3), 3)?.preventDefault).toBe(false)
  })
})
