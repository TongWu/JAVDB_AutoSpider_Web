import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const fetchSpy = vi.fn()
vi.mock('@/api/tasks', () => ({
  apiGetTaskStream: (id: string, offset: number) => fetchSpy(id, offset),
}))
vi.mock('@vueuse/core', async () => {
  const actual = await vi.importActual<typeof import('@vueuse/core')>('@vueuse/core')
  return { ...actual, useDocumentVisibility: () => ({ value: 'visible' }) }
})

import { useRunsStore } from '@/stores/runs'
import { useLogStream } from '@/composables/useLogStream'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'

describe('useLogStream', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    fetchSpy.mockReset()
    vi.useFakeTimers()
  })

  it('appends lines from API into the store', async () => {
    fetchSpy.mockResolvedValueOnce({ offset: 12, lines: ['hello', 'world'] })
    const runs = useRunsStore()
    const Test = defineComponent({
      setup() {
        useLogStream(() => 'job-1')
        return () => h('div')
      },
    })
    mount(Test)
    await vi.advanceTimersByTimeAsync(0)  // flush microtasks for first tick
    await vi.runOnlyPendingTimersAsync()
    expect(fetchSpy).toHaveBeenCalled()
    // store should have job-1 with 2 lines
    const stream = runs.getStream('job-1')
    expect(stream).toBeDefined()
    expect(stream?.lines.length).toBeGreaterThan(0)
    vi.useRealTimers()
  })

  it('marks stream done on terminal status', async () => {
    fetchSpy.mockResolvedValueOnce({ offset: 5, lines: ['done!'], status: 'success', done: true })
    const runs = useRunsStore()
    const Test = defineComponent({
      setup() {
        useLogStream(() => 'job-2')
        return () => h('div')
      },
    })
    mount(Test)
    await vi.advanceTimersByTimeAsync(0)
    await vi.runOnlyPendingTimersAsync()
    const stream = runs.getStream('job-2')
    expect(stream?.done).toBe(true)
    vi.useRealTimers()
  })
})
