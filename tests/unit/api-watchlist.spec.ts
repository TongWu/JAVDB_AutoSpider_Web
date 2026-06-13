import { beforeEach, describe, expect, it, vi } from 'vitest'

const getSpy = vi.fn()
const putSpy = vi.fn()
const deleteSpy = vi.fn()

vi.mock('@/api/client', () => ({
  http: {
    get: (...args: unknown[]) => getSpy(...args),
    put: (...args: unknown[]) => putSpy(...args),
    delete: (...args: unknown[]) => deleteSpy(...args),
  },
}))

import {
  deleteWatchIntent,
  getWatchIntent,
  listWatchIntents,
  upsertWatchIntent,
} from '@/api/watchlist'

const ROW = {
  video_code: 'ABC-001',
  href: '/v/abc001',
  status: 'want' as const,
  notes: null,
  status_at: null,
  updated_at: '2026-06-13T00:00:00.000Z',
}

describe('watchlist API client — path building', () => {
  beforeEach(() => {
    getSpy.mockReset()
    putSpy.mockReset()
    deleteSpy.mockReset()
  })

  it('listWatchIntents hits /api/watchlist with status/limit/offset params', async () => {
    getSpy.mockResolvedValueOnce({ data: { items: [], total: 0 } })

    const res = await listWatchIntents({ status: 'want', limit: 50, offset: 0 })

    expect(getSpy).toHaveBeenCalledTimes(1)
    expect(getSpy).toHaveBeenCalledWith('/api/watchlist', {
      params: { status: 'want', limit: 50, offset: 0 },
    })
    expect(res).toEqual({ items: [], total: 0 })
  })

  it('listWatchIntents omits the status filter when not given (undefined)', async () => {
    getSpy.mockResolvedValueOnce({ data: { items: [], total: 0 } })

    await listWatchIntents()

    expect(getSpy).toHaveBeenCalledWith('/api/watchlist', {
      params: { status: undefined, limit: 50, offset: 0 },
    })
  })

  it('getWatchIntent forwards skipErrorToast and returns the row', async () => {
    getSpy.mockResolvedValueOnce({ data: ROW })

    const res = await getWatchIntent('ABC-001', { skipErrorToast: true })

    expect(getSpy).toHaveBeenCalledWith('/api/watchlist/ABC-001', {
      skipErrorToast: true,
    })
    expect(res).toEqual(ROW)
  })

  it('upsertWatchIntent PUTs {href, status} to the video_code path', async () => {
    putSpy.mockResolvedValueOnce({ data: { ...ROW, status: 'viewed' } })

    const res = await upsertWatchIntent('ABC-001', {
      href: '/v/abc001',
      status: 'viewed',
    })

    expect(putSpy).toHaveBeenCalledTimes(1)
    expect(putSpy).toHaveBeenCalledWith('/api/watchlist/ABC-001', {
      href: '/v/abc001',
      status: 'viewed',
    })
    expect(res.status).toBe('viewed')
  })

  it('deleteWatchIntent DELETEs the video_code path (untrack = absent row)', async () => {
    deleteSpy.mockResolvedValueOnce({ data: { deleted: true } })

    await deleteWatchIntent('ABC-001')

    expect(deleteSpy).toHaveBeenCalledTimes(1)
    expect(deleteSpy).toHaveBeenCalledWith('/api/watchlist/ABC-001')
  })
})
