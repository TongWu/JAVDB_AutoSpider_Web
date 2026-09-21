import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { NSelect } from 'naive-ui'
import en from '@/i18n/locales/en.json'

const { authState, capState, listRules } = vi.hoisted(() => ({
  authState: { role: 'readonly' },
  capState: { data: { features: { content_filter: true } } },
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
  compareContentFilterImpact: vi.fn(),
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
})
