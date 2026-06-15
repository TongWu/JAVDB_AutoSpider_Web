import type { ContentFilterRule } from '@/api/content-filter'

export interface OverlayMovieRow {
  actor_name?: string | null
  actor_gender?: string | null
  supporting_actors?: string | null
}

const cf = (s: string | null | undefined): string => (s ?? '').toLowerCase().trim()

/**
 * Read-side hint: would an enabled rule exclude this row? This is a presentation
 * dimmer only — the authoritative filter runs at ingestion (javdb/spider/services/
 * content_filter.py). It covers only the dimensions the Movies search row carries
 * data for; rules over tag/age/regex/date never dim a row (fail-open).
 */
export function isDimmedByRules(row: OverlayMovieRow, rules: ContentFilterRule[]): boolean {
  for (const r of rules) {
    if (!r.enabled) continue
    if (r.dimension === 'actor' && r.mode === 'exclude') {
      const target = cf(r.value)
      if (target && (cf(row.actor_name) === target || cf(row.supporting_actors) === target)) return true
    } else if (r.dimension === 'gender' && r.mode === 'exclude_all_male') {
      // No female actor known on this row → would be dropped by the engine.
      if (cf(row.actor_gender) === 'male') return true
    }
    // Other dimensions/modes are not matchable from the search row → no dim.
  }
  return false
}
