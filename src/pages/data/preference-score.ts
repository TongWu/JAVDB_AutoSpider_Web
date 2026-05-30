// ADR-022 B3 — rule-based preference score (placeholder until ADR-025 replaces
// it with a trained model output). Kept as a pure function so the weighting can
// be unit-tested independently of the page.
//
//   score = (movie_rating / 5) * 0.5
//         + (actor_hearted ? 1.0 : 0.5) * 0.3
//         + (category_match_ratio) * 0.2
//
// `category_match_ratio` is a fixed 0.5 placeholder until ContentPreferences
// categories are wired in. An unrated movie contributes 0 for the rating term.
export function computePreferenceScore(
  rating: number | null,
  actorHearted: boolean,
): number {
  const movieScore = rating != null ? rating / 5 : 0
  const actorScore = actorHearted ? 1.0 : 0.5
  return movieScore * 0.5 + actorScore * 0.3 + 0.5 * 0.2
}
