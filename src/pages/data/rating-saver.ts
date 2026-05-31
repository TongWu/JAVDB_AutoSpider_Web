import type { MovieRating } from '@/api/preferences'
import { mergeRating, type RatingPatch, type RatingPayload } from './rating-merge'

/**
 * Dependencies injected into {@link createRatingSaver}. Keeping I/O behind this
 * interface lets the save orchestration be unit-tested without a live API or a
 * mounted component.
 */
export interface RatingSaverDeps {
  /** Current locally-cached row for an href, or undefined if not loaded. */
  getCached: (href: string) => MovieRating | undefined
  /** Fetch the canonical row from the backend; rejects (404) when unrated. */
  fetchRating: (href: string) => Promise<MovieRating>
  /** Full-replace upsert of the merged payload; resolves with the stored row. */
  upsert: (href: string, payload: RatingPayload) => Promise<MovieRating>
  /** Called with the canonical row after a successful save. */
  onSaved: (href: string, row: MovieRating) => void
  /** Called when a save fails. */
  onError: (e: unknown) => void
}

/**
 * Build a `saveRating(href, patch)` function that persists a single-field rating
 * edit safely against a full-replace backend upsert (ADR-022 C1):
 *
 * - **Merge over the freshest row.** If the row is missing from the local cache
 *   (the list endpoint is clamped to 200, so older ratings may be unloaded), it
 *   is fetched first, so a tags/notes edit never blanks out an unloaded rating.
 * - **Serialize per href.** Saves for the same href run strictly in order, so two
 *   overlapping edits in the expand editor (tags then notes) cannot read a stale
 *   snapshot and clobber each other — locally or on the backend. Different hrefs
 *   still run concurrently.
 */
export function createRatingSaver(
  deps: RatingSaverDeps,
): (href: string, patch: RatingPatch) => Promise<void> {
  const chains = new Map<string, Promise<unknown>>()

  async function doSave(href: string, patch: RatingPatch): Promise<void> {
    try {
      let existing = deps.getCached(href)
      if (!existing) {
        try {
          existing = await deps.fetchRating(href)
        } catch {
          existing = undefined // genuinely unrated yet (404) — defaults are correct
        }
      }
      const merged = mergeRating(existing, patch)
      const returned = await deps.upsert(href, merged)
      deps.onSaved(href, returned)
    } catch (e) {
      deps.onError(e)
    }
  }

  return function saveRating(href: string, patch: RatingPatch): Promise<void> {
    const next = (chains.get(href) ?? Promise.resolve())
      .catch(() => undefined)
      .then(() => doSave(href, patch))
    chains.set(href, next)
    void next.finally(() => {
      if (chains.get(href) === next) chains.delete(href)
    })
    return next
  }
}
