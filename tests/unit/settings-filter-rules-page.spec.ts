import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { NInput, NSelect } from 'naive-ui'
import en from '@/i18n/locales/en.json'
import contract from '../../server/__tests__/fixtures/content-filter-impact-contract.json'

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
  it.each(contract.portability_route_cases)('preserves comparison draft bytes: $name', async (testCase) => {
    const wrapper = mount(SettingsFilterRulesPage, { global: { plugins: [i18n] } })
    await flushPromises()
    const selects = wrapper.findAllComponents(NSelect)
    selects[0].vm.$emit('update:value', testCase.rule.dimension)
    selects[1].vm.$emit('update:value', testCase.rule.mode)
    wrapper.findComponent(NInput).vm.$emit('update:value', testCase.rule.value)
    await flushPromises()
    const button = findButton(wrapper, 'Compare draft')!
    expect(button.attributes('disabled')).toBeUndefined()
    await button.trigger('click')
    expect(compareImpact).toHaveBeenCalledWith(expect.objectContaining({
      draft_rules: [expect.objectContaining({
        id: null,
        value: testCase.rule.value.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, ''),
      })],
    }))
    wrapper.unmount()
  })

  it.each(['151', '١٨', '0000'])('rejects nonportable draft age %s', async (value) => {
    const wrapper = mount(SettingsFilterRulesPage, { global: { plugins: [i18n] } })
    await flushPromises()
    const selects = wrapper.findAllComponents(NSelect)
    selects[0].vm.$emit('update:value', 'age')
    selects[1].vm.$emit('update:value', 'min_age')
    wrapper.findComponent(NInput).vm.$emit('update:value', value)
    await flushPromises()
    expect(findButton(wrapper, 'Compare draft')!.attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

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

  it.each([1, 9007199254740991, 0, -1, 1.5, 9007199254740992])('validates saved rule ID %s before comparison', async (id) => {
    listRules.mockResolvedValueOnce({
      items: [{ id, dimension: 'tag', mode: 'exclude', value: '4K', enabled: true }],
      total: 1, baseline_identity: 'content-filter-rules', baseline_version: 'sha256:baseline',
    })
    const wrapper = mount(SettingsFilterRulesPage, { global: { plugins: [i18n] } })
    await flushPromises()
    wrapper.findComponent(NInput).vm.$emit('update:value', 'VR')
    await flushPromises()
    const button = findButton(wrapper, 'Compare draft')!
    if (id === 1 || id === 9007199254740991) {
      expect(button.attributes('disabled')).toBeUndefined()
      await button.trigger('click')
      expect(compareImpact.mock.calls[0][0].draft_rules.map((rule: { id: number | null }) => rule.id)).toEqual([id, null])
    } else {
      expect(button.attributes('disabled')).toBeDefined()
      await button.trigger('click')
      expect(compareImpact).not.toHaveBeenCalled()
    }
    wrapper.unmount()
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
        { id: null, value: 'VR' },
      ],
    })
  })
})
