import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'

// ADR-026 Phase 4: pin the OpsIncidentsPage alerting integration —
// AlertPolicyPanel is mounted, and the alert-status badge load is
// capability-gated on ops_alerting.
const { defaultIncidentsImpl, authState, capState } = vi.hoisted(() => {
  const INCIDENT = {
    incident_id: 'opsinc_1',
    trigger_source: 'workflow_failure',
    run_id: '123',
    run_attempt: 1,
    session_id: 'sess-1',
    incident_type: 'failed_ingestion',
    status: 'open',
    persistence_status: 'd1_written',
    model_version: 'm1',
    detector_version: 'd1',
    confidence: 'high',
    confirmed_findings: [],
    likely_causes: [],
    unknowns: [],
    recommended_next_actions: [],
    unsafe_actions: [],
    evidence_refs: [],
    created_at: '2026-06-13T00:00:00.000Z',
    updated_at: '2026-06-13T00:00:00.000Z',
    resolved_at: null,
  }
  const defaultIncidentsImpl = async () => ({ items: [INCIDENT] })
  return {
    INCIDENT,
    defaultIncidentsImpl,
    authState: { role: 'admin' },
    capState: { data: { features: { ops_alerting: true } } as Record<string, unknown> },
  }
})

vi.mock('@/api/diagnostics', () => ({
  listOpsIncidents: vi.fn(defaultIncidentsImpl),
  getOpsIncidentAnalytics: vi.fn().mockResolvedValue({
    total: 1, by_type: {}, by_status: {}, by_confidence: {}, open_high_confidence: 0,
  }),
  listRemediationProposals: vi.fn().mockResolvedValue({ items: [] }),
  decideRemediationProposal: vi.fn().mockResolvedValue({}),
  listAlertEvents: vi.fn().mockResolvedValue({
    items: [
      { alert_id: 'opsalert_1', incident_id: 'opsinc_1', policy_id: 'opspolicy_x', status: 'fired', reason: 'fired', fired_at: '2026-06-13T00:00:00.000Z' },
    ],
  }),
}))

vi.mock('@/stores/auth', () => ({ useAuthStore: () => authState }))
vi.mock('@/stores/capabilities', () => ({ useCapabilitiesStore: () => capState }))

// Stub the alerting panel — its own gating/admin behavior is covered by
// alert-policy-panel.spec.ts; here we only assert it is wired into the page.
vi.mock('@/components/diagnostics/AlertPolicyPanel.vue', () => ({
  default: { name: 'AlertPolicyPanel', template: '<div class="alert-policy-panel-stub" />' },
}))

vi.mock('naive-ui', async () => {
  const actual = await vi.importActual<typeof import('naive-ui')>('naive-ui')
  return { ...actual, useMessage: () => ({ error: vi.fn(), success: vi.fn() }) }
})

import OpsIncidentsPage from '@/pages/diagnostics/OpsIncidentsPage.vue'
import { listAlertEvents, listOpsIncidents } from '@/api/diagnostics'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  missingWarn: false,
  fallbackWarn: false,
  messages: {
    en: {
      common: { retry: 'Retry' },
      errors: { generic: { title: 'Error' } },
      diag: {
        opsIncidents: {
          title: 'Ops Incidents', subtitle: 'sub', analytics: 'Analytics',
          analyticsTotal: 'Total', analyticsHighConf: 'Open (High)',
          analyticsByType: 'By Type', analyticsByStatus: 'By Status', analyticsByConf: 'By Conf',
          filterStatus: 'Status', filterType: 'Type', filterConfidence: 'Confidence',
          empty: 'None', findings: 'Findings', causes: 'Causes', unknowns: 'Unknowns',
          nextActions: 'Next', unsafeActions: 'Unsafe', evidence: 'Evidence',
          copyId: 'Copy', copied: 'Copied', resolvedAt: 'Resolved',
          modelVersion: 'Model', detectorVersion: 'Detector',
          col: { createdAt: 'Created', type: 'Type', status: 'Status', confidence: 'Confidence', runId: 'Run', sessionId: 'Session', topFinding: 'Top' },
          alertStatus: { label: 'Alert status', none: 'No alert', fired: 'Fired', suppressed: 'Suppressed', skipped: 'Skipped' },
          proposals: { title: 'Proposals', empty: 'No proposals' },
        },
      },
    },
  },
})

const mountPage = () => mount(OpsIncidentsPage, { global: { plugins: [i18n] }, attachTo: document.body })

function setCapability(enabled: boolean) {
  capState.data = { features: { ops_alerting: enabled } }
}

async function openFirstIncident(wrapper: ReturnType<typeof mountPage>) {
  const row = wrapper.find('.n-data-table-tbody .n-data-table-tr')
  await row.trigger('click')
  await flushPromises()
}

let wrapper: ReturnType<typeof mountPage> | null = null

describe('OpsIncidentsPage — alerting integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(listOpsIncidents as ReturnType<typeof vi.fn>).mockImplementation(defaultIncidentsImpl)
    authState.role = 'admin'
    setCapability(true)
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    document.body.innerHTML = ''
  })

  it('mounts the AlertPolicyPanel', async () => {
    wrapper = mountPage()
    await flushPromises()
    expect(wrapper.find('.alert-policy-panel-stub').exists()).toBe(true)
  })

  it('loads alert events for the selected incident when ops_alerting is enabled', async () => {
    wrapper = mountPage()
    await flushPromises()
    await openFirstIncident(wrapper)
    expect(listAlertEvents).toHaveBeenCalledWith('opsinc_1')
    expect(document.body.textContent).toContain('Fired')
  })

  it('does NOT load alert events when ops_alerting is disabled', async () => {
    setCapability(false)
    wrapper = mountPage()
    await flushPromises()
    await openFirstIncident(wrapper)
    expect(listAlertEvents).not.toHaveBeenCalled()
    expect(document.body.textContent).not.toContain('Alert status')
  })
})
