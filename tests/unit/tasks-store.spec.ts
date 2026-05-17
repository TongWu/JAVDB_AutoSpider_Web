import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const listSpy = vi.fn()
vi.mock('@/api/tasks', () => ({
  apiListTasks: () => listSpy(),
}))

import { useTasksStore } from '@/stores/tasks'

const sample = [
  { job_id: 'job-1', mode: 'local', status: 'running', started_at: '2026-05-17T10:00:00Z' },
  { job_id: 'job-2', mode: 'github', status: 'success', started_at: '2026-05-17T09:00:00Z', duration_seconds: 240 },
  { job_id: 'job-3', mode: 'local', status: 'failed', started_at: '2026-05-17T08:00:00Z', duration_seconds: 12 },
]

describe('tasks store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    listSpy.mockReset()
    listSpy.mockResolvedValue({ tasks: sample })
  })

  it('fetchList populates items', async () => {
    const tasks = useTasksStore()
    await tasks.fetchList()
    expect(tasks.items.length).toBe(3)
  })

  it('status filter narrows results', async () => {
    const tasks = useTasksStore()
    await tasks.fetchList()
    tasks.setFilter('status', ['failed'])
    expect(tasks.filteredItems.length).toBe(1)
    expect(tasks.filteredItems[0].job_id).toBe('job-3')
  })

  it('mode filter narrows results', async () => {
    const tasks = useTasksStore()
    await tasks.fetchList()
    tasks.setFilter('mode', 'github')
    expect(tasks.filteredItems.length).toBe(1)
    expect(tasks.filteredItems[0].job_id).toBe('job-2')
  })

  it('search filter matches job id substring', async () => {
    const tasks = useTasksStore()
    await tasks.fetchList()
    tasks.setFilter('search', 'job-2')
    expect(tasks.filteredItems.length).toBe(1)
  })

  it('hasRunningTask reflects items', async () => {
    const tasks = useTasksStore()
    await tasks.fetchList()
    expect(tasks.hasRunningTask).toBe(true)
    listSpy.mockResolvedValueOnce({ tasks: sample.filter((t) => t.status !== 'running') })
    await tasks.fetchList()
    expect(tasks.hasRunningTask).toBe(false)
  })

  it('resetFilters clears state', async () => {
    const tasks = useTasksStore()
    await tasks.fetchList()
    tasks.setFilter('status', ['failed'])
    tasks.setFilter('search', 'foo')
    tasks.resetFilters()
    expect(tasks.filters.status).toEqual([])
    expect(tasks.filters.search).toBe('')
  })
})
