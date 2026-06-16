import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { NInput } from 'naive-ui'

// ADR-054 WS2 frontend coverage (Sprint-3 verification gap): pin the
// SubscriptionsView admin-gating + the follow/unfollow store calls.
const { defaultListImpl, authState } = vi.hoisted(() => {
  const ROWS = [
    {
      actor_href: '/actors/AAA',
      actor_name: 'Alice',
      active: 1,
      last_seen_href: null,
      last_checked_at: '2026-06-14T00:00:00.000Z',
      created_at: '2026-06-10T00:00:00.000Z',
      updated_at: '2026-06-14T00:00:00.000Z',
    },
  ]
  const defaultListImpl = async () => ({ items: ROWS, total: ROWS.length })
  // Mutable so each test can pick the role BEFORE mounting (computed reads it).
  return { defaultListImpl, authState: { role: 'admin' } }
})

vi.mock('@/api/subscriptions', () => ({
  listSubscriptions: vi.fn(defaultListImpl),
  upsertSubscription: vi.fn().mockResolvedValue({}),
  deleteSubscription: vi.fn().mockResolvedValue(true),
}))

vi.mock('@/stores/auth', () => ({ useAuthStore: () => authState }))

vi.mock('naive-ui', async () => {
  const actual = await vi.importActual<typeof import('naive-ui')>('naive-ui')
  return { ...actual, useMessage: () => ({ error: vi.fn(), success: vi.fn() }) }
})

import SubscriptionsView from '@/pages/library/SubscriptionsView.vue'
import {
  listSubscriptions,
  upsertSubscription,
  deleteSubscription,
} from '@/api/subscriptions'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      common: { retry: 'Retry' },
      library: {
        subscriptions: {
          loadError: 'Failed to load subscriptions.',
          saveError: 'Failed to save.',
          total: 'Followed actors',
          followed: 'Followed',
          addPlaceholder: '/actors/<id>',
          add: 'Add',
          unfollow: 'Unfollow',
          col: { actor: 'Actor', active: 'Active', lastChecked: 'Last checked', actions: 'Actions' },
        },
      },
    },
  },
})

const mountView = () => mount(SubscriptionsView, { global: { plugins: [i18n] } })

describe('SubscriptionsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(listSubscriptions as ReturnType<typeof vi.fn>).mockImplementation(defaultListImpl)
    authState.role = 'admin'
  })

  it('loads subscriptions on mount and renders followed actors', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(listSubscriptions).toHaveBeenCalled()
    expect(wrapper.text()).toContain('Alice')
  })

  it('admin sees the add row + unfollow action; a readonly account sees neither', async () => {
    authState.role = 'admin'
    const adminView = mountView()
    await flushPromises()
    expect(adminView.find('.add-row').exists()).toBe(true)
    expect(adminView.text()).toContain('Unfollow')

    authState.role = 'readonly'
    const roView = mountView()
    await flushPromises()
    expect(roView.find('.add-row').exists()).toBe(false)
    expect(roView.text()).not.toContain('Unfollow')
  })

  it('admin add → upsertSubscription with the trimmed href and active:true', async () => {
    const wrapper = mountView()
    await flushPromises()
    const addRow = wrapper.find('.add-row')
    addRow.findComponent(NInput).vm.$emit('update:value', '  /actors/BBB  ')
    await addRow.find('button').trigger('click')
    await flushPromises()
    expect(upsertSubscription).toHaveBeenCalledWith('/actors/BBB', { active: true })
  })

  it('unfollow → deleteSubscription with the actor href', async () => {
    const wrapper = mountView()
    await flushPromises()
    const unfollowBtn = wrapper
      .find('.n-data-table')
      .findAll('button')
      .find((b) => b.text() === 'Unfollow')
    await unfollowBtn!.trigger('click')
    await flushPromises()
    expect(deleteSubscription).toHaveBeenCalledWith('/actors/AAA')
  })
})
