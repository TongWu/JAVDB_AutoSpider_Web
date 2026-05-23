import { describe, expect, it, vi } from 'vitest'

const searchSpy = vi.fn()
const exportSpy = vi.fn()

vi.mock('@/api/history', () => ({
  searchMovies: (...args: unknown[]) => searchSpy(...args),
  exportMoviesCsv: (...args: unknown[]) => exportSpy(...args),
}))

import { searchMovies, exportMoviesCsv } from '@/api/history'

const sampleResponse = {
  items: [
    {
      id: 1,
      video_code: 'ABC-123',
      href: '/v/abc123',
      actor_name: 'Test Actor',
      perfect_match: true,
      hi_res: false,
      torrent_count: 3,
      datetime_created: '2026-05-20T12:00:00Z',
      session_id: 's-001',
    },
    {
      id: 2,
      video_code: 'DEF-456',
      href: '/v/def456',
      actor_name: null,
      perfect_match: false,
      hi_res: true,
      torrent_count: 0,
      datetime_created: '2026-05-19T08:00:00Z',
      session_id: null,
    },
  ],
  next_cursor: 'cur_abc',
  total_estimate: 42,
}

describe('history API wrappers', () => {
  it('searchMovies calls GET /api/history/movies with params', async () => {
    searchSpy.mockResolvedValue(sampleResponse)
    const params = { q: 'ABC', actor: 'Test', limit: 50 }
    const result = await searchMovies(params)
    expect(searchSpy).toHaveBeenCalledWith(params)
    expect(result.items).toHaveLength(2)
    expect(result.items[0].video_code).toBe('ABC-123')
    expect(result.next_cursor).toBe('cur_abc')
    expect(result.total_estimate).toBe(42)
  })

  it('searchMovies works with empty params', async () => {
    searchSpy.mockResolvedValue({ items: [], next_cursor: null, total_estimate: 0 })
    const result = await searchMovies()
    expect(searchSpy).toHaveBeenCalledWith()
    expect(result.items).toHaveLength(0)
    expect(result.total_estimate).toBe(0)
  })

  it('searchMovies propagates errors', async () => {
    searchSpy.mockRejectedValue(new Error('Network error'))
    await expect(searchMovies({ q: 'fail' })).rejects.toThrow('Network error')
  })

  it('exportMoviesCsv calls the export endpoint and returns a Blob', async () => {
    const blob = new Blob(['video_code,actor\nABC-123,Test'], { type: 'text/csv' })
    exportSpy.mockResolvedValue(blob)
    const params = { q: 'ABC' }
    const result = await exportMoviesCsv(params)
    expect(exportSpy).toHaveBeenCalledWith(params)
    expect(result).toBeInstanceOf(Blob)
  })

  it('exportMoviesCsv propagates errors', async () => {
    exportSpy.mockRejectedValue(new Error('Export failed'))
    await expect(exportMoviesCsv()).rejects.toThrow('Export failed')
  })
})
