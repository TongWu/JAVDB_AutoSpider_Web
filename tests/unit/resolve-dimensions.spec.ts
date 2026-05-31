import { describe, expect, it } from 'vitest'
import { extractDimensionNames } from '@/components/browse/resolve-dimensions'

// ADR-022 §C4: maker is a single {name, href} link, directors is a list of them.
describe('extractDimensionNames', () => {
  it('wraps a single maker link object into a one-name list', () => {
    expect(extractDimensionNames({ name: 'S1 No.1 Style', href: '/makers/x' })).toEqual([
      'S1 No.1 Style',
    ])
  })

  it('extracts names from a list of director links', () => {
    expect(
      extractDimensionNames([
        { name: 'Director A', href: '/directors/a' },
        { name: 'Director B', href: '/directors/b' },
      ]),
    ).toEqual(['Director A', 'Director B'])
  })

  it('returns an empty list for null/undefined', () => {
    expect(extractDimensionNames(null)).toEqual([])
    expect(extractDimensionNames(undefined)).toEqual([])
  })

  it('drops entries with a missing, non-string, or blank name', () => {
    expect(
      extractDimensionNames([
        { href: '/directors/no-name' },
        { name: 42 },
        { name: '   ' },
        { name: 'Real Name' },
      ]),
    ).toEqual(['Real Name'])
  })

  it('trims whitespace and de-duplicates repeated names', () => {
    expect(
      extractDimensionNames([
        { name: '  Dup  ' },
        { name: 'Dup' },
        { name: 'Other' },
      ]),
    ).toEqual(['Dup', 'Other'])
  })

  it('ignores non-object items in the list', () => {
    expect(extractDimensionNames(['a string', null, { name: 'Kept' }])).toEqual(['Kept'])
  })
})
