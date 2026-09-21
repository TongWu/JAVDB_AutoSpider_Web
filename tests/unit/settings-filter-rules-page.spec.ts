import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { NInput, NSelect } from 'naive-ui'
import en from '@/i18n/locales/en.json'

const { authState, capState, compareImpact, listRules } = vi.hoisted(() => ({
  authState: { role: 'readonly' },
  capState: { data: { features: { content_filter: true } } },
  compareImpact: vi.fn(),
  listRules: vi.fn().mockResolvedValue({
    items: [],
    total: 0,
    baseline_identity: 'content-filter-rules',
    baseline_version: 'sha256:baseline',
  }),
}))

vi.mock('@/stores/auth', () => ({ useAuthStore: () => authState }))
vi.mock('@/stores/capabilities', () => ({ useCapabilitiesStore: () => capState }))
vi.mock('@/api/content-filter', () => ({
  listContentFilterRules: listRules,
  addContentFilterRule: vi.fn(),
  setContentFilterRuleEnabled: vi.fn(),
  deleteContentFilterRule: vi.fn(),
  compareContentFilterImpact: compareImpact,
}))
vi.mock('naive-ui', async () => {
  const actual = await vi.importActual<typeof import('naive-ui')>('naive-ui')
  return { ...actual, useMessage: () => ({ error: vi.fn(), success: vi.fn() }) }
})

import SettingsFilterRulesPage from '@/pages/settings/SettingsFilterRulesPage.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  fallbackLocale: 'en',
  messages: { en },
})

function findButton(wrapper: ReturnType<typeof mount>, label: string) {
  return wrapper.findAll('button').find((button) => button.text().trim() === label)
}

describe('SettingsFilterRulesPage comparison authorization and validity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.role = 'readonly'
    listRules.mockResolvedValue({
      items: [],
      total: 0,
      baseline_identity: 'content-filter-rules',
      baseline_version: 'sha256:baseline',
    })
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('shows read-only draft comparison controls to a non-admin user', async () => {
    const wrapper = mount(SettingsFilterRulesPage, {
      global: { plugins: [i18n] },
      attachTo: document.body,
    })
    await flushPromises()

    expect(findButton(wrapper, 'Compare draft')).toBeDefined()
    expect(findButton(wrapper, 'Add')).toBeUndefined()
  })

  it('disables the invalid default draft but enables a valid no-value mode', async () => {
    const wrapper = mount(SettingsFilterRulesPage, {
      global: { plugins: [i18n] },
      attachTo: document.body,
    })
    await flushPromises()
    const compare = findButton(wrapper, 'Compare draft')
    expect(compare).toBeDefined()
    expect(compare!.attributes('disabled')).toBeDefined()

    const selects = wrapper.findAllComponents(NSelect)
    selects[0].vm.$emit('update:value', 'gender')
    selects[1].vm.$emit('update:value', 'exclude_all_male')
    await flushPromises()

    expect(compare!.attributes('disabled')).toBeUndefined()
  })

  it('reloads a changed baseline, preserves the draft, and waits for an intentional rerun', async () => {
    const wrapper = mount(SettingsFilterRulesPage, {
      global: { plugins: [i18n] },
      attachTo: document.body,
    })
    await flushPromises()

    const input = wrapper.findComponent(NInput)
    input.vm.$emit('update:value', 'VR')
    await flushPromises()
    compareImpact.mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 409,
        data: {
          detail: {
            error: { code: 'content_filter.baseline_changed', message: 'changed' },
            baseline_identity: 'content-filter-rules',
            baseline_version: 'sha256:new',
          },
        },
      },
    })
    listRules.mockResolvedValueOnce({
      items: [{ id: 7, dimension: 'tag', mode: 'exclude', value: '4K', enabled: true }],
      total: 1,
      baseline_identity: 'content-filter-rules',
      baseline_version: 'sha256:new',
    })

    await findButton(wrapper, 'Compare draft')!.trigger('click')
    await flushPromises()

    expect(compareImpact).toHaveBeenCalledTimes(1)
    expect(listRules).toHaveBeenCalledTimes(2)
    expect(input.props('value')).toBe('VR')

    compareImpact.mockResolvedValueOnce({
      baseline_identity: 'content-filter-rules',
      baseline_version: 'sha256:new',
      cohort_version: 'sha256:cohort',
      cohort_size: 500,
      page: 1,
      page_size: 100,
      total: 0,
      has_more: false,
      coverage: { total: 0, current_known: 0, draft_known: 0, both_known: 0 },
      summary: { current: {}, draft: {}, transitions: {}, missing_metadata: {} },
      items: [],
    })
    await findButton(wrapper, 'Compare draft')!.trigger('click')
    await flushPromises()

    expect(compareImpact).toHaveBeenCalledTimes(2)
    expect(compareImpact.mock.calls[1][0]).toMatchObject({
      baseline_version: 'sha256:new',
      draft_rules: [
        { id: 7, value: '4K' },
        { id: -1, value: 'VR' },
      ],
    })
  })
})
