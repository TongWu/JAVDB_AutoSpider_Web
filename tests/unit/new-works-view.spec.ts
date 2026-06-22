import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'

// ADR-054 WS2 frontend coverage (Sprint-3 verification gap): pin the
// NewWorksView load + dismiss-then-refetch flow and StatusControl reuse.
const { ROWS, defaultListImpl } = vi.hoisted(() => {
  const ROWS = [
    { video_code: 'N-1', href: '/v/n1', actor_href: '/actors/AAA', title: 'First', release_date: '2026-06-01', discovered_at: '2026-06-14T00:00:00.000Z', dismissed: 0 },
    { video_code: 'N-2', href: '/v/n2', actor_href: '/actors/AAA', title: 'Second', release_date: null, discovered_at: '2026-06-13T00:00:00.000Z', dismissed: 0 },
  ]
  const defaultListImpl = async () => ({ items: ROWS, total: ROWS.length })
  return { ROWS, defaultListImpl }
})

vi.mock('@/api/new-works', () => ({
  listNewWorks: vi.fn(defaultListImpl),
  dismissNewWork: vi.fn().mockResolvedValue(true),
}))

// Isolate from the real StatusControl (and its @/api/watchlist import); we only
// assert it is rendered once per row, not its internals (covered by WS1 specs).
vi.mock('@/components/StatusControl.vue', () => ({
  default: {
    name: 'StatusControl',
    props: ['videoCode', 'href', 'initialStatus'],
    template: '<span class="status-control-stub" />',
  },
}))

vi.mock('naive-ui', async () => {
  const actual = await vi.importActual<typeof import('naive-ui')>('naive-ui')
  return { ...actual, useMessage: () => ({ error: vi.fn(), success: vi.fn() }) }
})

import NewWorksView from '@/pages/library/NewWorksView.vue'
import { listNewWorks, dismissNewWork } from '@/api/new-works'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      common: { retry: 'Retry' },
      library: {
        newWorks: {
          loadError: 'Failed to load new works.',
          dismissError: 'Failed to dismiss.',
          total: 'New works',
          recent: 'Recently discovered',
          dismiss: 'Dismiss',
          col: { videoCode: 'Code', title: 'Title', releaseDate: 'Released', status: 'Status', actions: 'Actions' },
        },
      },
    },
  },
})

const mountView = () => mount(NewWorksView, { global: { plugins: [i18n] } })

describe('NewWorksView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(listNewWorks as ReturnType<typeof vi.fn>).mockImplementation(defaultListImpl)
  })

  it('loads the feed on mount and renders a StatusControl per row', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(listNewWorks).toHaveBeenCalledWith({ limit: 200 })
    expect(wrapper.text()).toContain('N-1')
    expect(wrapper.text()).toContain('N-2')
    expect(wrapper.findAll('.status-control-stub')).toHaveLength(ROWS.length)
  })

  it('dismiss → dismissNewWork(code) then refetch', async () => {
    const wrapper = mountView()
    await flushPromises()
    const callsAfterLoad = (listNewWorks as ReturnType<typeof vi.fn>).mock.calls.length

    const dismissBtn = wrapper
      .find('.n-data-table')
      .findAll('button')
      .find((b) => b.text() === 'Dismiss')
    await dismissBtn!.trigger('click')
    await flushPromises()

    // Dismiss is scoped to the row's actor so other actors' feeds survive (#229).
    expect(dismissNewWork).toHaveBeenCalledWith('N-1', '/actors/AAA')
    // dismiss() awaits dismissNewWork then fetchList() → one extra list call.
    expect((listNewWorks as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterLoad + 1)
  })
})
