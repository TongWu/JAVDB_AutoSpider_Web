import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import HeartButton from '@/components/HeartButton.vue'

vi.mock('@/api/preferences', () => ({
  upsertContentPreference: vi.fn().mockResolvedValue({}),
}))

// Stub useMessage so the component can mount without an NMessageProvider ancestor.
vi.mock('naive-ui', async () => {
  const actual = await vi.importActual<typeof import('naive-ui')>('naive-ui')
  return {
    ...actual,
    useMessage: () => ({
      error: vi.fn(),
      success: vi.fn(),
    }),
  }
})

import { upsertContentPreference } from '@/api/preferences'

describe('HeartButton', () => {
  it('renders the not-hearted icon when initialHearted is false', () => {
    const wrapper = mount(HeartButton, {
      props: {
        contentType: 'actor',
        contentId: '/actors/x',
        contentName: 'Name',
        initialHearted: false,
      },
    })
    expect(wrapper.text()).toContain('🤍')
  })

  it('upserts the preference and emits change on click', async () => {
    const wrapper = mount(HeartButton, {
      props: {
        contentType: 'actor',
        contentId: '/actors/x',
        contentName: 'Name',
        initialHearted: false,
      },
    })
    await wrapper.find('button').trigger('click')
    await Promise.resolve()
    await wrapper.vm.$nextTick()

    expect(upsertContentPreference).toHaveBeenCalledTimes(1)
    expect(upsertContentPreference).toHaveBeenCalledWith('actor', '/actors/x', {
      content_name: 'Name',
      hearted: true,
    })
    expect(wrapper.emitted('change')).toEqual([[true]])
    expect(wrapper.text()).toContain('❤️')
  })
})
