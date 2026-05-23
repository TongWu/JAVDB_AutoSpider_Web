import { describe, expect, it, vi } from 'vitest'

const searchSpy = vi.fn()
const exportSpy = vi.fn()

vi.mock('@/api/history', () => ({
  searchTorrents: (...args: unknown[]) => searchSpy(...args),
  exportTorrentsCsv: (...args: unknown[]) => exportSpy(...args),
}))

import { searchTorrents, exportTorrentsCsv } from '@/api/history'

const sampleResponse = {
  items: [
    {
      id: 1,
      movie_video_code: 'ABC-123',
      movie_href: '/v/abc123',
      magnet_uri: 'magnet:?xt=urn:btih:abc123def456',
      size: '4.2 GB',
      subtitle_indicator: 1,
      censor_indicator: 0,
      resolution_type: 3,
      file_count: 5,
      datetime_created: '2026-05-20T12:00:00Z',
      session_id: 's-001',
    },
    {
      id: 2,
      movie_video_code: null,
      movie_href: null,
      magnet_uri: null,
      size: null,
      subtitle_indicator: 0,
      censor_indicator: 1,
      resolution_type: 0,
      file_count: 1,
      datetime_created: '2026-05-19T08:00:00Z',
      session_id: null,
    },
  ],
  next_cursor: 'cur_xyz',
  total_estimate: 99,
}

describe('torrent history API wrappers', () => {
  it('searchTorrents calls GET /api/history/torrents with params', async () => {
    searchSpy.mockResolvedValue(sampleResponse)
    const params = { q: 'ABC', resolution_type: 3, limit: 50 }
    const result = await searchTorrents(params)
    expect(searchSpy).toHaveBeenCalledWith(params)
    expect(result.items).toHaveLength(2)
    expect(result.items[0].movie_video_code).toBe('ABC-123')
    expect(result.items[0].resolution_type).toBe(3)
    expect(result.items[0].subtitle_indicator).toBe(1)
    expect(result.next_cursor).toBe('cur_xyz')
    expect(result.total_estimate).toBe(99)
  })

  it('searchTorrents works with empty params', async () => {
    searchSpy.mockResolvedValue({ items: [], next_cursor: null, total_estimate: 0 })
    const result = await searchTorrents()
    expect(searchSpy).toHaveBeenCalledWith()
    expect(result.items).toHaveLength(0)
    expect(result.total_estimate).toBe(0)
  })

  it('searchTorrents propagates errors', async () => {
    searchSpy.mockRejectedValue(new Error('Network error'))
    await expect(searchTorrents({ q: 'fail' })).rejects.toThrow('Network error')
  })

  it('exportTorrentsCsv calls the export endpoint and returns a Blob', async () => {
    const blob = new Blob(['movie_video_code,magnet_uri\nABC-123,magnet:?xt=...'], { type: 'text/csv' })
    exportSpy.mockResolvedValue(blob)
    const params = { q: 'ABC' }
    const result = await exportTorrentsCsv(params)
    expect(exportSpy).toHaveBeenCalledWith(params)
    expect(result).toBeInstanceOf(Blob)
  })

  it('exportTorrentsCsv propagates errors', async () => {
    exportSpy.mockRejectedValue(new Error('Export failed'))
    await expect(exportTorrentsCsv()).rejects.toThrow('Export failed')
  })
})
