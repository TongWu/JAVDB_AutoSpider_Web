import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { NSelect } from 'naive-ui'

// Two intents: one 'want' (A-1), one 'viewed' (B-2). The grand-total head
// request (limit:1, unfiltered) reports total=2 regardless of the filter.
const { ROWS } = vi.hoisted(() => ({
  ROWS: [
    {
      video_code: 'A-1',
      href: '/v/a1',
      status: 'want',
      notes: null,
      status_at: null,
      updated_at: '2026-06-13T00:00:00.000Z',
    },
    {
      video_code: 'B-2',
      href: '/v/b2',
      status: 'viewed',
      notes: null,
      status_at: null,
      updated_at: '2026-06-12T00:00:00.000Z',
    },
  ],
}))

vi.mock('@/api/watchlist', () => ({
  listWatchIntents: vi.fn(
    async (params: { status?: string | null; limit?: number } = {}) => {
      // Unfiltered head request used purely for the grand-total KPI.
      if (params.limit === 1) return { items: ROWS.slice(0, 1), total: ROWS.length }
      const filtered = params.status
        ? ROWS.filter((r) => r.status === params.status)
        : ROWS
      return { items: filtered, total: filtered.length }
    },
  ),
  upsertWatchIntent: vi.fn().mockResolvedValue({}),
  deleteWatchIntent: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('naive-ui', async () => {
  const actual = await vi.importActual<typeof import('naive-ui')>('naive-ui')
  return { ...actual, useMessage: () => ({ error: vi.fn(), success: vi.fn() }) }
})

import WatchlistView from '@/pages/library/WatchlistView.vue'
import { deleteWatchIntent, listWatchIntents } from '@/api/watchlist'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      common: { retry: 'Retry' },
      library: {
        watchlist: {
          loadError: 'Failed to load watchlist.',
          saveError: 'Failed to update status.',
          total: 'Tracked',
          recent: 'Watchlist',
          untracked: 'Untracked',
          allStatuses: 'All',
          statusAriaLabel: 'Watch status for {code}',
          status: { want: 'Want', viewed: 'Viewed' },
          col: { videoCode: 'Code', status: 'Status', updatedAt: 'Updated' },
        },
      },
    },
  },
})

function trackedValue(wrapper: ReturnType<typeof mount>): string {
  const stat = wrapper
    .findAll('.n-statistic')
    .find((s) => s.find('.n-statistic__label').text() === 'Tracked')
  return stat!.find('.n-statistic-value').text()
}

describe('WatchlistView', () => {
  beforeEach(() => vi.clearAllMocks())

  it('keeps the "Tracked" KPI at the grand total when a status filter narrows the table', async () => {
    const wrapper = mount(WatchlistView, { global: { plugins: [i18n] } })
    await flushPromises()

    expect(trackedValue(wrapper)).toContain('2')
    expect(wrapper.text()).toContain('A-1')
    expect(wrapper.text()).toContain('B-2')

    // Apply the "Want" filter via the filter-row select.
    wrapper.find('.filter-row').findComponent(NSelect).vm.$emit('update:value', 'want')
    await flushPromises()

    // Table is narrowed to the want row, but the KPI still reports the grand total.
    expect(wrapper.text()).toContain('A-1')
    expect(wrapper.text()).not.toContain('B-2')
    expect(trackedValue(wrapper)).toContain('2')
  })

  it('untracks a row in place — no full reload, KPI decrements, row removed', async () => {
    const wrapper = mount(WatchlistView, { global: { plugins: [i18n] } })
    await flushPromises()
    const listCallsAfterLoad = (listWatchIntents as ReturnType<typeof vi.fn>).mock.calls.length

    // Clear the first data-row's StatusControl (A-1) → DELETE / untrack.
    wrapper.find('.n-data-table').findAllComponents(NSelect)[0].vm.$emit('update:value', null)
    await flushPromises()

    expect(deleteWatchIntent).toHaveBeenCalledWith('A-1')
    // No reload was issued — the list is reconciled locally.
    expect((listWatchIntents as ReturnType<typeof vi.fn>).mock.calls.length).toBe(
      listCallsAfterLoad,
    )
    // Grand total dropped 2 → 1 and the row is gone from the table.
    expect(trackedValue(wrapper)).toContain('1')
    expect(wrapper.text()).not.toContain('A-1')
  })

  it('re-statusing a row out of the active filter drops it in place, KPI unchanged', async () => {
    const wrapper = mount(WatchlistView, { global: { plugins: [i18n] } })
    await flushPromises()

    // Narrow to "Want": only A-1 remains in the table; KPI stays the grand total.
    wrapper.find('.filter-row').findComponent(NSelect).vm.$emit('update:value', 'want')
    await flushPromises()
    const listCallsAfterFilter = (listWatchIntents as ReturnType<typeof vi.fn>).mock.calls
      .length
    expect(wrapper.text()).toContain('A-1')

    // Change A-1 from "want" to "viewed" — it no longer matches the active filter.
    wrapper.find('.n-data-table').findAllComponents(NSelect)[0].vm.$emit('update:value', 'viewed')
    await flushPromises()

    // No reload; the row leaves the filtered view but the grand total is unchanged
    // (it is still tracked, just viewed now).
    expect((listWatchIntents as ReturnType<typeof vi.fn>).mock.calls.length).toBe(
      listCallsAfterFilter,
    )
    expect(wrapper.text()).not.toContain('A-1')
    expect(trackedValue(wrapper)).toContain('2')
  })
})
