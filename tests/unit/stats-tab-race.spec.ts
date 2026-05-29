import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '@/i18n/locales/en.json'
import UploadQbTab from '@/pages/stats/tabs/UploadQbTab.vue'
import { getStatsTrend, type TrendResponse } from '@/api/stats'

vi.mock('naive-ui', () => ({
  NAlert: { template: '<div role="alert"><slot /></div>' },
  NButton: { template: '<button><slot /></button>' },
  NCard: { template: '<section><slot /></section>' },
  NGi: { template: '<div><slot /></div>' },
  NGrid: { template: '<div><slot /></div>' },
  NSpin: {
    props: ['show'],
    template: '<div data-test="spin" :data-show="String(show)"><slot /></div>',
  },
}))

vi.mock('vue-chartjs', () => ({
  Line: {
    props: ['data'],
    template: '<pre class="line-data">{{ JSON.stringify(data) }}</pre>',
  },
}))

vi.mock('@/api/stats', () => ({
  getStatsTrend: vi.fn(),
  getStatsDistribution: vi.fn(),
}))

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
}

interface TrendRequest extends Deferred<TrendResponse> {
  metric: string
  period: string
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve
    reject = innerReject
  })
  return { promise, resolve, reject }
}

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  fallbackLocale: 'en',
  messages: { en },
})

let trendRequests: TrendRequest[]

function mountTab(period = '30d') {
  return mount(UploadQbTab, {
    props: { period },
    global: {
      plugins: [i18n],
    },
  })
}

function trendResponse(request: TrendRequest, date: string, value: number): TrendResponse {
  return {
    metric: request.metric,
    period: request.period,
    data_points: [{ date, value }],
  }
}

function resolveRequest(request: TrendRequest, date: string, value: number) {
  request.resolve(trendResponse(request, date, value))
}

beforeEach(() => {
  trendRequests = []
  vi.mocked(getStatsTrend).mockReset()
  vi.mocked(getStatsTrend).mockImplementation((metric: string, period: string) => {
    const request = { metric, period, ...deferred<TrendResponse>() }
    trendRequests.push(request)
    return request.promise
  })
})

describe('stats tab period races', () => {
  it('keeps loading on the latest request when a stale request rejects', async () => {
    const wrapper = mountTab('30d')
    await wrapper.setProps({ period: '7d' })

    expect(trendRequests.map((request) => request.period)).toEqual(['30d', '30d', '7d', '7d'])

    trendRequests[0].reject(new Error('stale failure'))
    resolveRequest(trendRequests[1], 'stale-duplicate', 0.2)
    await flushPromises()

    expect(wrapper.find('[data-test="spin"]').attributes('data-show')).toBe('true')
    expect(wrapper.text()).not.toContain('stale failure')

    resolveRequest(trendRequests[2], 'latest-success', 0.9)
    resolveRequest(trendRequests[3], 'latest-duplicate', 0.1)
    await flushPromises()

    expect(wrapper.find('[data-test="spin"]').attributes('data-show')).toBe('false')
    expect(wrapper.text()).toContain('latest-success')
  })

  it('ignores stale success data that resolves after a newer request', async () => {
    const wrapper = mountTab('30d')
    await wrapper.setProps({ period: '7d' })

    resolveRequest(trendRequests[2], 'latest-success', 0.9)
    resolveRequest(trendRequests[3], 'latest-duplicate', 0.1)
    await flushPromises()

    resolveRequest(trendRequests[0], 'stale-success', 0.3)
    resolveRequest(trendRequests[1], 'stale-duplicate', 0.4)
    await flushPromises()

    expect(wrapper.text()).toContain('latest-success')
    expect(wrapper.text()).toContain('latest-duplicate')
    expect(wrapper.text()).not.toContain('stale-success')
    expect(wrapper.text()).not.toContain('stale-duplicate')
  })
})
