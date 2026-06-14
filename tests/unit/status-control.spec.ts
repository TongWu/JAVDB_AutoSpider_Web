import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { NSelect } from 'naive-ui'

vi.mock('@/api/watchlist', () => ({
  upsertWatchIntent: vi.fn().mockResolvedValue({}),
  deleteWatchIntent: vi.fn().mockResolvedValue(undefined),
}))

// Stub useMessage so the component mounts without an NMessageProvider ancestor
// (mirrors heart-button.spec.ts).
vi.mock('naive-ui', async () => {
  const actual = await vi.importActual<typeof import('naive-ui')>('naive-ui')
  return { ...actual, useMessage: () => ({ error: vi.fn(), success: vi.fn() }) }
})

import StatusControl from '@/components/StatusControl.vue'
import { deleteWatchIntent, upsertWatchIntent } from '@/api/watchlist'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      library: {
        watchlist: {
          untracked: 'Untracked',
          saveError: 'Failed to update status.',
          statusAriaLabel: 'Watch status for {code}',
          status: { want: 'Want', viewed: 'Viewed' },
        },
      },
    },
  },
})

function mountControl(props: Record<string, unknown> = {}) {
  return mount(StatusControl, {
    props: { videoCode: 'ABC-001', href: '/v/abc001', initialStatus: null, ...props },
    global: { plugins: [i18n] },
  })
}

describe('StatusControl', () => {
  beforeEach(() => vi.clearAllMocks())

  it('exposes an accessible name carrying the video code (a11y)', () => {
    const wrapper = mountControl()
    // The accessible name must be present and disambiguate the row, since the
    // NSelect placeholder is not exposed as a control name to assistive tech.
    expect(wrapper.find('[aria-label="Watch status for ABC-001"]').exists()).toBe(true)
  })

  it('upserts and emits change when a status is selected', async () => {
    const wrapper = mountControl()
    wrapper.findComponent(NSelect).vm.$emit('update:value', 'want')
    await flushPromises()

    expect(upsertWatchIntent).toHaveBeenCalledTimes(1)
    expect(upsertWatchIntent).toHaveBeenCalledWith('ABC-001', {
      href: '/v/abc001',
      status: 'want',
    })
    expect(wrapper.emitted('change')).toEqual([['want']])
  })

  it('deletes (untracks) and emits null when cleared', async () => {
    const wrapper = mountControl({ initialStatus: 'want' })
    wrapper.findComponent(NSelect).vm.$emit('update:value', null)
    await flushPromises()

    expect(deleteWatchIntent).toHaveBeenCalledTimes(1)
    expect(deleteWatchIntent).toHaveBeenCalledWith('ABC-001')
    expect(upsertWatchIntent).not.toHaveBeenCalled()
    expect(wrapper.emitted('change')).toEqual([[null]])
  })
})
