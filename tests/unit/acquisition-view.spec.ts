// tests/unit/acquisition-view.spec.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'

vi.mock('@/api/library', () => ({
  getAcquisitionSummary: vi.fn(async () => ({
    queued: 5, downloading: 3, completed: 100, stalled: 1, failed: 2, total: 111,
  })),
  getAcquisitionRecent: vi.fn(async () => [
    {
      qb_hash: 'abc12345', video_code: 'ABC-123', href: '/v/abc', category: 'subtitle',
      state: 'downloading', queued_at: '2026-06-01T00:00:00.000000Z',
      completed_at: null, last_seen_at: '2026-06-01T00:00:00.000000Z',
    },
  ]),
  getAcquisitionTrend: vi.fn(async () => [
    { date: '2026-06-04', completed: 1, stalled: 0, failed: 0 },
  ]),
}))

// Stub the chart so jsdom never touches a real <canvas> context.
vi.mock('vue-chartjs', () => ({ Bar: { name: 'Bar', render: () => null } }))

import AcquisitionView from '@/pages/library/AcquisitionView.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      library: {
        allStates: 'All states', funnel: 'Funnel', trend: 'Trend', recent: 'Recent',
        comingSoon: 'Coming soon',
        kpi: { queued: 'Queued', downloading: 'Downloading', completed: 'Completed', stalled: 'Stalled', failed: 'Failed' },
        state: { queued: 'Queued', downloading: 'Downloading', completed: 'Completed', in_library: 'In library', stalled: 'Stalled', failed: 'Failed' },
        col: { videoCode: 'Code', category: 'Category', state: 'State', queuedAt: 'Queued', completedAt: 'Completed', lastSeenAt: 'Last seen' },
      },
    },
  },
})

describe('AcquisitionView', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('renders KPI values and the recent table row', async () => {
    const wrapper = mount(AcquisitionView, { global: { plugins: [i18n] } })
    await flushPromises()
    expect(wrapper.text()).toContain('Completed')
    expect(wrapper.text()).toContain('ABC-123')
  })
})
