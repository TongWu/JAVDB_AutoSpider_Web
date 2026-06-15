import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const searchSpy = vi.fn()
const resolveSpy = vi.fn()
const downloadSpy = vi.fn()
const oneClickSpy = vi.fn()
const syncCookieSpy = vi.fn()
const aggregateSpy = vi.fn()

vi.mock('@/api/explore', () => ({
  apiSearchByVideoCode: (...args: unknown[]) => searchSpy(...args),
  apiResolve: (...args: unknown[]) => resolveSpy(...args),
  apiDownloadMagnet: (...args: unknown[]) => downloadSpy(...args),
  apiOneClick: (...args: unknown[]) => oneClickSpy(...args),
  apiSyncCookie: (...args: unknown[]) => syncCookieSpy(...args),
  apiAggregateMagnets: (...args: unknown[]) => aggregateSpy(...args),
}))

const capFlag = vi.hoisted(() => ({ on: false }))
vi.mock('@/stores/capabilities', () => ({
  useCapabilitiesStore: () => ({ data: { features: { magnet_aggregation: capFlag.on } } }),
}))

import { useBrowseStore } from '@/stores/browse'

describe('browse store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    sessionStorage.clear()
    searchSpy.mockReset()
    resolveSpy.mockReset()
    downloadSpy.mockReset()
    oneClickSpy.mockReset()
    syncCookieSpy.mockReset()
    aggregateSpy.mockReset()
    capFlag.on = false
  })

  it('classifyQuery distinguishes code, url, and invalid', () => {
    const browse = useBrowseStore()
    expect(browse.classifyQuery('ABC-123')).toBe('code')
    expect(browse.classifyQuery('abc-123')).toBe('code')
    expect(browse.classifyQuery('SSIS-001')).toBe('code')
    expect(browse.classifyQuery('https://javdb.com/v/abc')).toBe('url')
    expect(browse.classifyQuery('  https://javdb.com/rankings  ')).toBe('url')
    expect(browse.classifyQuery('hello world')).toBeNull()
    expect(browse.classifyQuery('')).toBeNull()
  })

  it('submit with a video code calls apiSearchByVideoCode and stores result', async () => {
    searchSpy.mockResolvedValueOnce({
      video_code: 'ABC-123',
      search_url: 'x',
      movies: [],
      letter_suffix_fallback_searched: false,
    })
    const browse = useBrowseStore()
    await browse.submit('abc-123')
    expect(searchSpy).toHaveBeenCalledWith('ABC-123')
    expect(browse.lastResolve?.kind).toBe('code')
    expect(browse.recentSearches[0]).toBe('abc-123')
  })

  it('submit with a URL calls apiResolve', async () => {
    resolveSpy.mockResolvedValueOnce({
      url: 'https://javdb.com/v/abc',
      page_type: 'detail',
      detail: { title: 'X', code: 'ABC-1' },
    })
    const browse = useBrowseStore()
    await browse.submit('https://javdb.com/v/abc')
    expect(resolveSpy).toHaveBeenCalled()
    expect(browse.lastResolve?.kind).toBe('detail')
  })

  it('submit with an invalid query sets error and does not call API', async () => {
    const browse = useBrowseStore()
    await browse.submit('nonsense')
    expect(searchSpy).not.toHaveBeenCalled()
    expect(resolveSpy).not.toHaveBeenCalled()
    expect(browse.error).toMatch(/video code|URL/i)
  })

  it('recentSearches dedupes and caps at 10', async () => {
    searchSpy.mockResolvedValue({
      video_code: 'X',
      search_url: '',
      movies: [],
      letter_suffix_fallback_searched: false,
    })
    const browse = useBrowseStore()
    for (let i = 0; i < 15; i++) {
      await browse.submit(`AA-${100 + i}`)
    }
    expect(browse.recentSearches.length).toBe(10)
    // Latest goes to the front, oldest fell off.
    expect(browse.recentSearches[0]).toBe('AA-114')

    await browse.submit('AA-114') // dedup — already at front
    expect(browse.recentSearches.length).toBe(10)
    expect(browse.recentSearches[0]).toBe('AA-114')
  })

  it('downloadMagnet forwards to apiDownloadMagnet', async () => {
    downloadSpy.mockResolvedValueOnce({ status: 'ok' })
    const browse = useBrowseStore()
    await browse.downloadMagnet('magnet:?xt=urn:btih:abc', 'My Title', 'Daily')
    expect(downloadSpy).toHaveBeenCalledWith('magnet:?xt=urn:btih:abc', 'My Title', 'Daily')
  })

  it('oneClick forwards to apiOneClick', async () => {
    oneClickSpy.mockResolvedValueOnce({ status: 'ok' })
    const browse = useBrowseStore()
    const res = await browse.oneClick('https://javdb.com/v/abc')
    expect(oneClickSpy).toHaveBeenCalledWith('https://javdb.com/v/abc')
    expect(res.status).toBe('ok')
  })

  describe('aggregateMagnets', () => {
    it('gate off → does not call API, returns empty rows', async () => {
      capFlag.on = false
      const browse = useBrowseStore()
      const r = await browse.aggregateMagnets('ABC-123')
      expect(aggregateSpy).not.toHaveBeenCalled()
      expect(r).toEqual({ rows: [], error: null })
    })

    it('success → maps response rows correctly', async () => {
      capFlag.on = true
      aggregateSpy.mockResolvedValueOnce({
        video_code: 'ABC-123',
        magnets: [
          {
            magnet_uri: 'magnet:?xt=urn:btih:abc',
            name: 'My Title',
            size: '1.4 GB',
            tags: [],
            file_count: 3,
            info_hash: 'abc',
            sources: ['JAVBUS', 'Sukebei'],
            quality_score: 8.5,
            quality_reasons: ['hd', 'multi-source'],
          },
        ],
      })
      const browse = useBrowseStore()
      const r = await browse.aggregateMagnets('ABC-123')
      expect(aggregateSpy).toHaveBeenCalledWith('ABC-123')
      expect(r.error).toBeNull()
      expect(r.rows[0].magnet).toBe('magnet:?xt=urn:btih:abc')
      expect(r.rows[0].title).toBe('My Title')
      expect(r.rows[0].size).toBe('1.4 GB')
      expect(r.rows[0].source).toBe('JAVBUS, Sukebei')
      expect(r.rows[0].sources).toEqual(['JAVBUS', 'Sukebei'])
      expect(r.rows[0].quality_score).toBe(8.5)
      expect(r.rows[0].quality_reasons).toEqual(['hd', 'multi-source'])
    })

    it('reject → captures error message, returns empty rows', async () => {
      capFlag.on = true
      aggregateSpy.mockRejectedValueOnce(new Error('boom'))
      const browse = useBrowseStore()
      const r = await browse.aggregateMagnets('ABC-123')
      expect(r.rows).toEqual([])
      expect(r.error).toBe('boom')
    })

    it('source-less magnet → empty source, does not discard the result', async () => {
      capFlag.on = true
      // Per the OpenAPI contract only magnet_uri + name are required; a magnet may
      // omit sources. It must not throw (which would discard every aggregated row).
      aggregateSpy.mockResolvedValueOnce({
        video_code: 'ABC-123',
        magnets: [{ magnet_uri: 'magnet:?xt=urn:btih:def', name: 'No Sources' }],
      })
      const browse = useBrowseStore()
      const r = await browse.aggregateMagnets('ABC-123')
      expect(r.error).toBeNull()
      expect(r.rows).toHaveLength(1)
      expect(r.rows[0].source).toBe('')
      expect(r.rows[0].sources).toEqual([])
    })
  })
})
