// ADR-022 C1 — pure helper that merges a partial rating edit over the current
// row's state into a full payload. The backend `PUT .../rating` does a
// full-replace upsert (missing fields become null/[]), so a single-field edit
// (e.g. updating only `tags`) must still send `rating` and `notes` or it would
// wipe them. Each field uses the patch value when the key is PRESENT (so an
// explicit `null` clears it) and otherwise falls back to the current row.

import type { MovieRating } from '@/api/preferences'

export interface RatingPatch {
  rating?: number | null
  tags?: string[]
  notes?: string | null
}

export interface RatingPayload {
  rating: number | null
  tags: string[]
  notes: string | null
}

export function mergeRating(
  current: MovieRating | undefined,
  patch: RatingPatch,
): RatingPayload {
  return {
    rating: 'rating' in patch ? (patch.rating ?? null) : (current?.rating ?? null),
    tags: 'tags' in patch ? (patch.tags ?? []) : (current?.tags ?? []),
    notes: 'notes' in patch ? (patch.notes ?? null) : (current?.notes ?? null),
  }
}
