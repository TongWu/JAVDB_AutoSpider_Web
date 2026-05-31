// ADR-022 §C4 — extract dimension chip names (maker / director) out of a
// MovieMetadataResponse field for the /browse ResolveCard.
//
// The metadata maker field is a single `{name, href}` link object; the
// directors field is a list of them. Both are typed loosely as
// `{[key: string]: string}` in the generated API types, so this normaliser
// defensively reads `.name`, trims, drops blanks, and de-duplicates. The
// resulting names double as the heart `contentId` (name-as-id convention),
// keeping ContentPreferences rows shared across pages.
export function extractDimensionNames(value: unknown): string[] {
  const items = Array.isArray(value) ? value : value == null ? [] : [value]
  const names: string[] = []
  const seen = new Set<string>()
  for (const item of items) {
    if (item == null || typeof item !== 'object') continue
    const name = (item as Record<string, unknown>).name
    if (typeof name !== 'string') continue
    const trimmed = name.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    names.push(trimmed)
  }
  return names
}
