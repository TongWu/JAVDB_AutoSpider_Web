import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'

vi.mock('@/api/library_ownership', () => ({
  getOwnershipSummary: vi.fn(async () => ({
    total_owned_titles: 42,
    by_source: [
      { source: 'qb', unique_titles: 30, present_rows: 30, total_bytes: 107374182400 },
      { source: 'gdrive', unique_titles: 12, present_rows: 12, total_bytes: 53687091200 },
    ],
  })),
  getOwnershipRecent: vi.fn(async () => [
    {
      video_code: 'ABC-123',
      source: 'qb',
      category: 'subtitle',
      path: '/dl/ABC-123.mkv',
      size: 2147483648,
      present: 1,
      observed_at: '2026-06-03T00:00:00.000000Z',
    },
  ]),
}))

vi.mock('vue-chartjs', () => ({ Bar: { name: 'Bar', render: () => null } }))

import OwnershipView from '@/pages/library/OwnershipView.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      common: { retry: 'Retry' },
      library: {
        comingSoon: 'Coming soon',
        ownership: {
          loadError: 'Failed to load ownership data.',
          totalOwned: 'Owned titles',
          breakdown: 'By source',
          recent: 'Recent ownership',
          allSources: 'All sources',
          present: 'Present',
          swept: 'Swept',
          source: { qb: 'qBittorrent', nas: 'NAS', gdrive: 'Google Drive', pikpak: 'PikPak' },
          col: {
            videoCode: 'Code', source: 'Source', category: 'Category',
            path: 'Path', size: 'Size', present: 'Present', observedAt: 'Observed',
          },
        },
      },
    },
  },
})

describe('OwnershipView', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('renders total KPI and recent table row', async () => {
    const wrapper = mount(OwnershipView, { global: { plugins: [i18n] } })
    await flushPromises()
    expect(wrapper.text()).toContain('42')       // total_owned_titles
    expect(wrapper.text()).toContain('ABC-123')  // recent row
  })
})
