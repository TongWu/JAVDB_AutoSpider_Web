// ADR-022 C3 — pure reducer for the keyboard-driven batch annotation mode on
// the movies page. Kept side-effect-free so the navigation/rating logic can be
// unit-tested independently of the DOM. The page's keydown handler applies the
// returned state and performs the actual rating upsert.

export interface BatchState {
  focusedIndex: number
  pendingRating: number | null
}

export interface BatchKeyResult {
  state: BatchState
  // When non-null, the page should persist `rating` for the row at `index`.
  save: { index: number; rating: number } | null
  // True when the browser default for the key should be suppressed (Space scroll).
  preventDefault: boolean
}

const RATING_KEYS = new Set(['1', '2', '3', '4', '5'])

/**
 * Compute the next batch-annotation state for a pressed key.
 *
 * Returns `null` for keys that are not part of the annotation shortcuts (the
 * caller should ignore them). `itemCount` is the number of rows currently shown.
 *
 * - j: focus next row (clamped to the last index)
 * - k: focus previous row (clamped to 0)
 * - 1–5: set the pending rating
 * - Enter: emit a save for the focused row when a rating is pending, then
 *   advance and clear the pending rating
 * - Space: advance without rating (preventDefault to avoid page scroll)
 */
export function reduceBatchKey(
  key: string,
  state: BatchState,
  itemCount: number,
): BatchKeyResult | null {
  const lastIndex = itemCount - 1
  const next = (i: number) => Math.min(i + 1, lastIndex)
  const prev = (i: number) => Math.max(i - 1, 0)

  if (key === 'j') {
    return { state: { ...state, focusedIndex: next(state.focusedIndex) }, save: null, preventDefault: false }
  }
  if (key === 'k') {
    return { state: { ...state, focusedIndex: prev(state.focusedIndex) }, save: null, preventDefault: false }
  }
  if (RATING_KEYS.has(key)) {
    return { state: { ...state, pendingRating: Number(key) }, save: null, preventDefault: false }
  }
  if (key === 'Enter') {
    const canSave =
      state.pendingRating !== null &&
      state.focusedIndex >= 0 &&
      state.focusedIndex <= lastIndex
    const save = canSave ? { index: state.focusedIndex, rating: state.pendingRating as number } : null
    return {
      state: { focusedIndex: next(state.focusedIndex), pendingRating: null },
      save,
      preventDefault: false,
    }
  }
  if (key === ' ') {
    return { state: { ...state, focusedIndex: next(state.focusedIndex) }, save: null, preventDefault: true }
  }
  return null
}
