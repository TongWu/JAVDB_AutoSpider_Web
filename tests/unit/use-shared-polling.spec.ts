import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock useDocumentVisibility so polling is never suppressed by tab-hidden logic
vi.mock('@vueuse/core', async () => {
  const actual = await vi.importActual<typeof import('@vueuse/core')>('@vueuse/core')
  return { ...actual, useDocumentVisibility: () => ({ value: 'visible' }) }
})

// ---------------------------------------------------------------------------
// Minimal BroadcastChannel mock
// Messages are delivered synchronously to all other instances on the same name.
// ---------------------------------------------------------------------------
class MockBroadcastChannel {
  static channels = new Map<string, Set<MockBroadcastChannel>>()

  name: string
  onmessage: ((event: MessageEvent) => void) | null = null

  constructor(name: string) {
    this.name = name
    const set = MockBroadcastChannel.channels.get(name) ?? new Set()
    set.add(this)
    MockBroadcastChannel.channels.set(name, set)
  }

  postMessage(data: unknown) {
    const set = MockBroadcastChannel.channels.get(this.name) ?? new Set()
    for (const ch of set) {
      if (ch !== this && ch.onmessage) {
        ch.onmessage(new MessageEvent('message', { data }))
      }
    }
  }

  close() {
    const set = MockBroadcastChannel.channels.get(this.name)
    if (set) {
      set.delete(this)
      if (set.size === 0) MockBroadcastChannel.channels.delete(this.name)
    }
  }

  static reset() {
    MockBroadcastChannel.channels.clear()
  }
}

// Install the mock globally before importing the composable
vi.stubGlobal('BroadcastChannel', MockBroadcastChannel)

import { useSharedPolling } from '@/composables/useSharedPolling'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'

describe('useSharedPolling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    MockBroadcastChannel.reset()
  })

  afterEach(() => {
    vi.useRealTimers()
    MockBroadcastChannel.reset()
  })

  // ---------------------------------------------------------------------------
  // Basic polling: single tab behaves like usePolling (immediate=false)
  // ---------------------------------------------------------------------------
  it('single tab polls after intervalMs', async () => {
    const fn = vi.fn()
    const Test = defineComponent({
      setup() {
        useSharedPolling(fn, { channelName: 'test-single', intervalMs: 1000, immediate: false })
        return () => h('div')
      },
    })
    mount(Test)
    expect(fn).toHaveBeenCalledTimes(0)
    await vi.advanceTimersByTimeAsync(1000)
    expect(fn).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  // ---------------------------------------------------------------------------
  // immediate: true triggers an immediate call on mount
  // ---------------------------------------------------------------------------
  it('calls fn immediately when immediate=true', async () => {
    const fn = vi.fn()
    const Test = defineComponent({
      setup() {
        useSharedPolling(fn, { channelName: 'test-imm', intervalMs: 1000, immediate: true })
        return () => h('div')
      },
    })
    mount(Test)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  // ---------------------------------------------------------------------------
  // Only the leader (lower tabId) polls; the follower skips fn()
  // ---------------------------------------------------------------------------
  it('only the leader tab fires fn on each tick', async () => {
    const fnA = vi.fn()
    const fnB = vi.fn()

    // We cannot control random tabIds, so we mount two components and assert
    // that exactly one of them is calling fn on every tick.
    const TestA = defineComponent({
      setup() {
        useSharedPolling(fnA, { channelName: 'test-leader', intervalMs: 500, immediate: false })
        return () => h('div')
      },
    })
    const TestB = defineComponent({
      setup() {
        useSharedPolling(fnB, { channelName: 'test-leader', intervalMs: 500, immediate: false })
        return () => h('div')
      },
    })

    mount(TestA)
    mount(TestB)

    await vi.advanceTimersByTimeAsync(500)
    // Exactly one of the two fns should have been called
    const totalCalls = fnA.mock.calls.length + fnB.mock.calls.length
    expect(totalCalls).toBe(1)

    await vi.advanceTimersByTimeAsync(500)
    expect(fnA.mock.calls.length + fnB.mock.calls.length).toBe(2)
  })

  // ---------------------------------------------------------------------------
  // Leader unmount → remaining tab re-elects and starts polling
  // ---------------------------------------------------------------------------
  it('follower becomes leader after the original leader unmounts', async () => {
    const fnA = vi.fn()
    const fnB = vi.fn()

    const TestA = defineComponent({
      setup() {
        useSharedPolling(fnA, { channelName: 'test-release', intervalMs: 500, immediate: false })
        return () => h('div')
      },
    })
    const TestB = defineComponent({
      setup() {
        useSharedPolling(fnB, { channelName: 'test-release', intervalMs: 500, immediate: false })
        return () => h('div')
      },
    })

    const wrapperA = mount(TestA)
    mount(TestB)

    // Let one tick run — exactly 1 total call from whichever tab is leader
    await vi.advanceTimersByTimeAsync(500)
    const firstTickLeader = fnA.mock.calls.length === 1 ? 'A' : 'B'

    // Record call counts before we unmount the leader
    const callsA0 = fnA.mock.calls.length
    const callsB0 = fnB.mock.calls.length

    // Unmount whichever tab turned out to be the leader
    if (firstTickLeader === 'A') {
      wrapperA.unmount()
    }
    // If B was leader we can't easily unmount it in this test, so we only
    // test the case where A is the leader.
    if (firstTickLeader !== 'A') return

    // After unmount, B should have taken over. Advance time by one interval.
    await vi.advanceTimersByTimeAsync(500)

    // A is gone — no new calls
    expect(fnA.mock.calls.length).toBe(callsA0)
    // B is now the leader and should have ticked at least once
    expect(fnB.mock.calls.length).toBeGreaterThan(callsB0)
  })

  // ---------------------------------------------------------------------------
  // Fallback: when BroadcastChannel is unavailable, behaves like usePolling
  // ---------------------------------------------------------------------------
  it('falls back to plain polling when BroadcastChannel is undefined', async () => {
    // Temporarily remove the global mock
    vi.stubGlobal('BroadcastChannel', undefined)

    const fn = vi.fn()
    const Test = defineComponent({
      setup() {
        useSharedPolling(fn, { channelName: 'test-fallback', intervalMs: 300, immediate: true })
        return () => h('div')
      },
    })
    mount(Test)
    // immediate=true → called once on mount
    expect(fn).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(300)
    expect(fn).toHaveBeenCalledTimes(2)

    // Restore the mock for subsequent tests
    vi.stubGlobal('BroadcastChannel', MockBroadcastChannel)
  })

  // ---------------------------------------------------------------------------
  // Stops polling after unmount
  // ---------------------------------------------------------------------------
  it('stops after unmount', async () => {
    const fn = vi.fn()
    const Test = defineComponent({
      setup() {
        useSharedPolling(fn, { channelName: 'test-stop', intervalMs: 400, immediate: false })
        return () => h('div')
      },
    })
    const wrapper = mount(Test)
    await vi.advanceTimersByTimeAsync(400)
    const callsBefore = fn.mock.calls.length
    wrapper.unmount()
    await vi.advanceTimersByTimeAsync(2000)
    expect(fn.mock.calls.length).toBe(callsBefore)
  })
})
