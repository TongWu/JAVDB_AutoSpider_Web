import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'

vi.mock('@/api/library_consumption', () => ({
  getConsumptionSummary: vi.fn(async () => ({
    total_signals: 10,
    watched_count: 7,
    unwatched_count: 2,
    avg_rating: 8.2,
    unique_titles: 5,
    instance_count: 2,
    unresolved_count: 1,
  })),
  getConsumptionRecent: vi.fn(async () => [
    {
      video_code: 'ABC-123',
      source_type: 'emby',
      instance: 'emby-home',
      library_id: 'lib-1',
      library_name: 'Movies',
      watched: true,
      progress_pct: 100,
      play_count: 1,
      rating: 9.0,
      watched_at: '2026-06-01T20:00:00.000000Z',
      resolved_confidence: 'high',
      observed_at: '2026-06-02T00:00:00.000000Z',
    },
  ]),
  getConsumptionTrend: vi.fn(async () => [
    { date: '2026-06-01', watched: 1, total_signals: 1 },
  ]),
  getConsumptionUnresolved: vi.fn(async () => []),
}))

vi.mock('vue-chartjs', () => ({ Bar: { name: 'Bar', render: () => null } }))

import ConsumptionView from '@/pages/library/ConsumptionView.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      common: { retry: 'Retry' },
      library: {
        comingSoon: 'Coming soon',
        consumption: {
          loadError: 'Failed.',
          totalSignals: 'Total signals',
          watched: 'Watched',
          unwatched: 'Unwatched',
          unresolved: 'Unresolved',
          avgRating: 'Avg rating',
          trend: 'Watch trend',
          recent: 'Recent signals',
          unresolvedSection: 'Unresolved items',
          allInstances: 'All instances',
          allWatched: 'All',
          watchedTrue: 'Watched',
          watchedFalse: 'Unwatched',
          ratingNone: '—',
          col: {
            videoCode: 'Code', sourceType: 'Source type', instance: 'Instance',
            library: 'Library', watched: 'Watched', rating: 'Rating',
            watchedAt: 'Watched at', confidence: 'Confidence', observedAt: 'Observed',
          },
          unresolvedCol: {
            instance: 'Instance', sourceType: 'Source type', library: 'Library',
            itemId: 'Item ID', rawTitle: 'Raw title', filePath: 'File path', observedAt: 'Observed',
          },
        },
      },
    },
  },
})

describe('ConsumptionView', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('renders KPI cards and the recent table row', async () => {
    const wrapper = mount(ConsumptionView, { global: { plugins: [i18n] } })
    await flushPromises()

    // Anchor each KPI to its own NStatistic so an unrelated "10"/"8.2"
    // elsewhere in the DOM can't make a loose assertion pass.
    const totalStat = wrapper
      .findAll('.n-statistic')
      .find((s) => s.find('.n-statistic__label').text() === 'Total signals')
    expect(totalStat).toBeDefined()
    expect(totalStat!.find('.n-statistic-value').text()).toContain('10') // total_signals

    // avg_rating renders in its own labeled badge (".avg-rating").
    const avg = wrapper.find('.avg-rating')
    expect(avg.exists()).toBe(true)
    expect(avg.text()).toMatch(/Avg rating:\s*8\.2/)

    expect(wrapper.text()).toContain('ABC-123') // recent row video_code
  })
})
