import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const searchSpy = vi.fn()
const resolveSpy = vi.fn()
const downloadSpy = vi.fn()
const oneClickSpy = vi.fn()
const syncCookieSpy = vi.fn()

vi.mock('@/api/explore', () => ({
  apiSearchByVideoCode: (...args: unknown[]) => searchSpy(...args),
  apiResolve: (...args: unknown[]) => resolveSpy(...args),
  apiDownloadMagnet: (...args: unknown[]) => downloadSpy(...args),
  apiOneClick: (...args: unknown[]) => oneClickSpy(...args),
  apiSyncCookie: (...args: unknown[]) => syncCookieSpy(...args),
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
})
