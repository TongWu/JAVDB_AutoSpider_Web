import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@vueuse/core', async () => {
  const actual = await vi.importActual<typeof import('@vueuse/core')>('@vueuse/core')
  return { ...actual, useDocumentVisibility: () => ({ value: 'visible' }) }
})

import { usePolling } from '@/composables/usePolling'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'

describe('usePolling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('calls fn on tick after intervalMs', async () => {
    const fn = vi.fn()
    const Test = defineComponent({
      setup() {
        usePolling(fn, { intervalMs: 1000, immediate: true })
        return () => h('div')
      },
    })
    mount(Test)
    expect(fn).toHaveBeenCalledTimes(1)  // immediate
    await vi.advanceTimersByTimeAsync(1000)
    expect(fn).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1000)
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('stops calling after unmount', async () => {
    const fn = vi.fn()
    const Test = defineComponent({
      setup() {
        usePolling(fn, { intervalMs: 500, immediate: true })
        return () => h('div')
      },
    })
    const wrapper = mount(Test)
    await vi.advanceTimersByTimeAsync(500)
    const callsBeforeUnmount = fn.mock.calls.length
    wrapper.unmount()
    await vi.advanceTimersByTimeAsync(2000)
    expect(fn.mock.calls.length).toBe(callsBeforeUnmount)
  })
})
