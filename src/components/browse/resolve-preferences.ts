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
