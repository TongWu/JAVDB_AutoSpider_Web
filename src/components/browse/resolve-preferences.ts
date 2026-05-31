import { computePreferenceScore } from '@/pages/data/preference-score'

// The lead actor (first in the list) drives the actor term of the B3 score.
export function leadActorHearted(actors: string[], actorHearted: Map<string, boolean>): boolean {
  const lead = actors[0]
  return lead != null ? (actorHearted.get(lead) ?? false) : false
}

// B3 preference score for a resolved movie detail, reusing the shared rule-based formula.
export function resolvePreferenceScore(
  rating: number | null,
  actors: string[],
  actorHearted: Map<string, boolean>,
): number {
  return computePreferenceScore(rating, leadActorHearted(actors, actorHearted))
}

// Overlay a freshly-fetched ContentPreferences snapshot onto the in-memory map
// without clobbering hearts the user toggled locally before the snapshot landed
// (ADR-022 §C4). `locked` holds the names the user changed this session; those
// keep their current local value, everything else comes from the server snapshot.
// Returns a new Map so Vue refs assigned to it stay reactive.
export function reconcileHearted(
  snapshot: Map<string, boolean>,
  current: Map<string, boolean>,
  locked: Set<string>,
): Map<string, boolean> {
  const merged = new Map(snapshot)
  for (const name of locked) {
    merged.set(name, current.get(name) ?? false)
  }
  return merged
}
