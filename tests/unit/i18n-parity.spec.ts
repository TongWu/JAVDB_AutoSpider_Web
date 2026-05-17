import { describe, expect, it } from 'vitest'
import en from '@/i18n/locales/en.json'
import zhCN from '@/i18n/locales/zh-CN.json'
import ja from '@/i18n/locales/ja.json'

function flattenKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const out: string[] = []
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out.push(...flattenKeys(v as Record<string, unknown>, path))
    } else {
      out.push(path)
    }
  }
  return out.sort()
}

describe('i18n locale parity', () => {
  it('en, zh-CN, ja have identical key sets', () => {
    const enKeys = flattenKeys(en)
    const zhKeys = flattenKeys(zhCN)
    const jaKeys = flattenKeys(ja)
    expect(zhKeys).toEqual(enKeys)
    expect(jaKeys).toEqual(enKeys)
  })
})
