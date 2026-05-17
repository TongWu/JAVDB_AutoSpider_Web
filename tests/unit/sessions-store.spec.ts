import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const listSpy = vi.fn()
const detailSpy = vi.fn()
vi.mock('@/api/sessions', () => ({
  apiListSessions: (...args: unknown[]) => listSpy(...args),
  apiGetSession: (id: string) => detailSpy(id),
}))

import { useSessionsStore } from '@/stores/sessions'

const sample = [
  { session_id: 's-001', state: 'in_progress', write_mode: 'pending', run_id: 'r1', run_attempt: 1, created_at: '2026-05-17T10:00:00Z' },
  { session_id: 's-002', state: 'committed',    write_mode: 'audit',   run_id: 'r2', run_attempt: 1, created_at: '2026-05-17T09:00:00Z' },
  { session_id: 's-003', state: 'failed',       write_mode: 'audit',   run_id: null, run_attempt: null, created_at: '2026-05-17T08:00:00Z' },
  { session_id: 's-004', state: 'finalizing',   write_mode: 'pending', run_id: 'r3', run_attempt: 2, created_at: '2026-05-17T07:00:00Z' },
]

describe('sessions store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    listSpy.mockReset()
    detailSpy.mockReset()
    listSpy.mockResolvedValue({ items: sample, next_cursor: null })
  })

  it('fetchList populates items', async () => {
    const sessions = useSessionsStore()
    await sessions.fetchList()
    expect(sessions.items.length).toBe(4)
  })

  it('state filter narrows results', async () => {
    const sessions = useSessionsStore()
    await sessions.fetchList()
    sessions.setFilter('state', ['failed'])
    expect(sessions.filteredItems.length).toBe(1)
    expect(sessions.filteredItems[0].session_id).toBe('s-003')
  })

  it('write-mode filter narrows results', async () => {
    const sessions = useSessionsStore()
    await sessions.fetchList()
    sessions.setFilter('writeMode', 'pending')
    expect(sessions.filteredItems.length).toBe(2)
  })

  it('search filter matches session id substring', async () => {
    const sessions = useSessionsStore()
    await sessions.fetchList()
    sessions.setFilter('search', 's-002')
    expect(sessions.filteredItems.length).toBe(1)
  })

  it('hasActiveSession is true when in_progress or finalizing present', async () => {
    const sessions = useSessionsStore()
    await sessions.fetchList()
    expect(sessions.hasActiveSession).toBe(true)
    listSpy.mockResolvedValueOnce({
      items: sample.filter((s) => !['in_progress', 'finalizing'].includes(s.state)),
      next_cursor: null,
    })
    await sessions.fetchList()
    expect(sessions.hasActiveSession).toBe(false)
  })

  it('resetFilters clears state', async () => {
    const sessions = useSessionsStore()
    await sessions.fetchList()
    sessions.setFilter('state', ['failed'])
    sessions.setFilter('search', 'foo')
    sessions.resetFilters()
    expect(sessions.filters.state).toEqual([])
    expect(sessions.filters.search).toBe('')
  })

  it('getDetail caches and force-refreshes', async () => {
    detailSpy.mockResolvedValue({ session: sample[0], movies: [], torrents: [] })
    const sessions = useSessionsStore()
    await sessions.getDetail('s-001')
    await sessions.getDetail('s-001')
    expect(detailSpy).toHaveBeenCalledTimes(1)

    await sessions.getDetail('s-001', true)
    expect(detailSpy).toHaveBeenCalledTimes(2)
  })

  it('invalidateDetail forces next fetch', async () => {
    detailSpy.mockResolvedValue({ session: sample[0], movies: [], torrents: [] })
    const sessions = useSessionsStore()
    await sessions.getDetail('s-001')
    sessions.invalidateDetail('s-001')
    await sessions.getDetail('s-001')
    expect(detailSpy).toHaveBeenCalledTimes(2)
  })
})
