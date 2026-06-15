import { describe, it, expect } from 'vitest'
import { isDimmedByRules } from '@/pages/data/content-filter-overlay'
import type { ContentFilterRule } from '@/api/content-filter'

const rule = (over: Partial<ContentFilterRule>): ContentFilterRule => ({
  id: 1, dimension: 'actor', mode: 'exclude', value: '', enabled: true, ...over,
})

const row = (over: Partial<{ actor_name: string | null; actor_gender: string | null; supporting_actors: string | null }>) => ({
  actor_name: null, actor_gender: null, supporting_actors: null, ...over,
})

describe('isDimmedByRules', () => {
  it('dims when an enabled actor-exclude rule matches the lead actor', () => {
    expect(isDimmedByRules(row({ actor_name: 'Jane Doe' }), [rule({ dimension: 'actor', mode: 'exclude', value: 'Jane Doe' })])).toBe(true)
  })

  it('matches case-insensitively (mirrors the engine casefold)', () => {
    expect(isDimmedByRules(row({ actor_name: 'Jane Doe' }), [rule({ value: 'jane doe' })])).toBe(true)
  })

  it('ignores disabled rules', () => {
    expect(isDimmedByRules(row({ actor_name: 'Jane Doe' }), [rule({ value: 'Jane Doe', enabled: false })])).toBe(false)
  })

  it('does not dim for dimensions the row carries no data for (tag/age — fail-open)', () => {
    expect(isDimmedByRules(row({ actor_name: 'Jane Doe' }), [rule({ dimension: 'tag', mode: 'exclude', value: 'x' })])).toBe(false)
  })

  it('dims on gender exclude_all_male when no female actor is present', () => {
    expect(isDimmedByRules(row({ actor_gender: 'male' }), [rule({ dimension: 'gender', mode: 'exclude_all_male', value: '' })])).toBe(true)
  })

  it('returns false when there are no rules', () => {
    expect(isDimmedByRules(row({ actor_name: 'Jane Doe' }), [])).toBe(false)
  })

  it('dims on gender require_lead when the known lead gender mismatches', () => {
    expect(isDimmedByRules(row({ actor_gender: 'male' }), [rule({ dimension: 'gender', mode: 'require_lead', value: 'female' })])).toBe(true)
  })

  it('does not dim require_lead when the lead gender matches', () => {
    expect(isDimmedByRules(row({ actor_gender: 'female' }), [rule({ dimension: 'gender', mode: 'require_lead', value: 'female' })])).toBe(false)
  })

  it('fail-opens require_lead when the lead gender is unknown', () => {
    expect(isDimmedByRules(row({ actor_gender: null }), [rule({ dimension: 'gender', mode: 'require_lead', value: 'female' })])).toBe(false)
  })
})
