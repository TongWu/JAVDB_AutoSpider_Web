import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { NSwitch } from 'naive-ui'

// ADR-026 Phase 4 (proactive incident alerting) FE coverage: pin the
// AlertPolicyPanel capability-gating + admin-only write controls.
const { defaultListImpl, authState, capState } = vi.hoisted(() => {
  const POLICIES = [
    {
      policy_id: 'opspolicy_x',
      incident_type: 'failed_ingestion',
      min_confidence: 'medium' as const,
      enabled: true,
      channels: ['email'],
      updated_by: 'admin',
      created_at: '2026-06-13T00:00:00.000Z',
      updated_at: '2026-06-13T00:00:00.000Z',
    },
  ]
  const defaultListImpl = async () => ({ items: POLICIES })
  // Mutable so each test selects role + capability BEFORE mounting.
  return {
    defaultListImpl,
    authState: { role: 'admin' },
    capState: { data: { features: { ops_alerting: true } } as Record<string, unknown> },
  }
})

vi.mock('@/api/diagnostics', () => ({
  listAlertPolicies: vi.fn(defaultListImpl),
  upsertAlertPolicy: vi.fn().mockResolvedValue({}),
}))

vi.mock('@/stores/auth', () => ({ useAuthStore: () => authState }))
vi.mock('@/stores/capabilities', () => ({ useCapabilitiesStore: () => capState }))

vi.mock('naive-ui', async () => {
  const actual = await vi.importActual<typeof import('naive-ui')>('naive-ui')
  return { ...actual, useMessage: () => ({ error: vi.fn(), success: vi.fn() }) }
})

import AlertPolicyPanel from '@/components/diagnostics/AlertPolicyPanel.vue'
import { listAlertPolicies, upsertAlertPolicy } from '@/api/diagnostics'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      common: { retry: 'Retry' },
      diag: {
        alerting: {
          title: 'Incident Alerting',
          subtitle: 'Configure alerting.',
          readonlyHint: 'Read-only access.',
          loadError: 'Failed to load alert policies.',
          saveSuccess: 'Saved.',
          saveError: 'Failed to save.',
          save: 'Save',
          channelsPlaceholder: 'Select channels',
          col: {
            type: 'Incident type',
            enabled: 'Enabled',
            minConfidence: 'Min confidence',
            channels: 'Channels',
            actions: 'Actions',
          },
        },
      },
    },
  },
})

const mountPanel = () => mount(AlertPolicyPanel, { global: { plugins: [i18n] } })

function setCapability(enabled: boolean) {
  capState.data = { features: { ops_alerting: enabled } }
}

describe('AlertPolicyPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(listAlertPolicies as ReturnType<typeof vi.fn>).mockImplementation(defaultListImpl)
    authState.role = 'admin'
    setCapability(true)
  })

  it('renders nothing and does not load when ops_alerting capability is off', async () => {
    setCapability(false)
    const wrapper = mountPanel()
    await flushPromises()
    expect(wrapper.find('.alert-policy-panel').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Incident Alerting')
    expect(listAlertPolicies).not.toHaveBeenCalled()
  })

  it('loads policies and renders a row per incident type when enabled', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    expect(listAlertPolicies).toHaveBeenCalled()
    expect(wrapper.find('.alert-policy-panel').exists()).toBe(true)
    expect(wrapper.text()).toContain('failed_ingestion')
    expect(wrapper.text()).toContain('login_failure')
  })

  it('admin sees Save controls; a readonly account sees none and a read-only hint', async () => {
    authState.role = 'admin'
    const adminView = mountPanel()
    await flushPromises()
    expect(adminView.findAll('button').find((b) => b.text() === 'Save')).toBeTruthy()

    authState.role = 'readonly'
    const roView = mountPanel()
    await flushPromises()
    expect(roView.findAll('button').find((b) => b.text() === 'Save')).toBeUndefined()
    expect(roView.text()).toContain('Read-only access.')
    expect(roView.findAllComponents(NSwitch).every((s) => s.props('disabled') === true)).toBe(true)
  })

  it('admin enabling a type and saving calls upsertAlertPolicy with the draft', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    // Row 0 = failed_ingestion (enabled in POLICIES). Flip its switch, then Save.
    const firstSwitch = wrapper.findAllComponents(NSwitch)[0]
    firstSwitch.vm.$emit('update:value', false)
    await flushPromises()
    const saveBtn = wrapper.findAll('button').find((b) => b.text() === 'Save')
    await saveBtn!.trigger('click')
    await flushPromises()
    expect(upsertAlertPolicy).toHaveBeenCalledWith('failed_ingestion', {
      min_confidence: 'medium',
      enabled: false,
      channels: ['email'],
    })
  })

  it('shows an error banner when policy loading fails', async () => {
    ;(listAlertPolicies as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('boom'))
    const wrapper = mountPanel()
    await flushPromises()
    expect(wrapper.find('.alert-policy-panel').exists()).toBe(true)
    expect(wrapper.text()).toContain('boom')
  })
})
