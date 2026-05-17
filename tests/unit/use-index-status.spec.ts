import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'

const indexStatusSpy = vi.fn()

vi.mock('@/api/explore', () => ({
  apiIndexStatus: (...args: unknown[]) => indexStatusSpy(...args),
}))

import { useIndexStatus } from '@/composables/useIndexStatus'

describe('useIndexStatus composable', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    indexStatusSpy.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('debounces observe() calls and flushes after 150 ms', async () => {
    const scope = effectScope()
    indexStatusSpy.mockResolvedValueOnce({
      items: {
        'href-a': { downloaded: true, has_uncensored: false },
        'href-b': { downloaded: false, has_uncensored: false },
      },
    })

    let api!: ReturnType<typeof useIndexStatus>
    scope.run(() => {
      api = useIndexStatus()
    })

    api.observe('href-a')
    api.observe('href-b')
    expect(indexStatusSpy).not.toHaveBeenCalled()

    vi.advanceTimersByTime(150)
    await Promise.resolve() // let pending microtasks settle
    await Promise.resolve()

    expect(indexStatusSpy).toHaveBeenCalledTimes(1)
    expect(api.statuses.value.get('href-a')?.status).toBe('committed')
    expect(api.statuses.value.get('href-b')?.status).toBe('unknown')

    scope.stop()
  })

  it('chunks > 50 hrefs into multiple batches on flushNow', async () => {
    const scope = effectScope()
    indexStatusSpy.mockResolvedValue({ items: {} })

    let api!: ReturnType<typeof useIndexStatus>
    scope.run(() => {
      api = useIndexStatus()
    })

    for (let i = 0; i < 60; i++) api.observe(`href-${i}`)
    await api.flushNow()

    expect(indexStatusSpy).toHaveBeenCalledTimes(2)
    const firstArg = indexStatusSpy.mock.calls[0][0] as Array<{ href: string }>
    const secondArg = indexStatusSpy.mock.calls[1][0] as Array<{ href: string }>
    expect(firstArg.length).toBe(50)
    expect(secondArg.length).toBe(10)

    scope.stop()
  })

  it('ignores re-observing an href once status is known', async () => {
    const scope = effectScope()
    indexStatusSpy.mockResolvedValue({
      items: { 'href-x': { downloaded: true, has_uncensored: false } },
    })

    let api!: ReturnType<typeof useIndexStatus>
    scope.run(() => {
      api = useIndexStatus()
    })

    api.observe('href-x')
    await api.flushNow()
    expect(indexStatusSpy).toHaveBeenCalledTimes(1)

    // Re-observe → no new fetch
    api.observe('href-x')
    await api.flushNow()
    expect(indexStatusSpy).toHaveBeenCalledTimes(1)

    scope.stop()
  })

  it('marks all queued hrefs as unknown when the API rejects', async () => {
    const scope = effectScope()
    indexStatusSpy.mockRejectedValueOnce(new Error('boom'))

    let api!: ReturnType<typeof useIndexStatus>
    scope.run(() => {
      api = useIndexStatus()
    })

    api.observe('href-fail')
    await api.flushNow()
    expect(api.statuses.value.get('href-fail')?.status).toBe('unknown')

    scope.stop()
  })
})
