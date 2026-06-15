<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NAlert,
  NButton,
  NCard,
  NDataTable,
  NDescriptions,
  NDescriptionsItem,
  NDrawer,
  NDrawerContent,
  NInput,
  NModal,
  NSelect,
  NSpace,
  NSpin,
  NTag,
  useMessage,
} from 'naive-ui'
import type { DataTableColumns } from 'naive-ui'
import {
  decideRemediationProposal,
  getOpsIncidentAnalytics,
  listAlertEvents,
  listOpsIncidents,
  listRemediationProposals,
  type ListOpsIncidentParams,
  type OpsAlertEvent,
  type OpsIncident,
  type OpsIncidentAnalytics,
  type OpsRemediationProposal,
  type RemediationDecisionRequest,
} from '@/api/diagnostics'
import { extractErrorMessage } from '@/api/errors'
import { useAuthStore } from '@/stores/auth'
import { useCapabilitiesStore } from '@/stores/capabilities'
import AlertPolicyPanel from '@/components/diagnostics/AlertPolicyPanel.vue'

const { t } = useI18n()
const message = useMessage()
const auth = useAuthStore()
// The decision POST requires the 'admin' role; only admins see the controls so
// read-only users aren't invited into a confirmation flow that would 403.
const isAdmin = computed(() => auth.role === 'admin')

const cap = useCapabilitiesStore()
// ADR-026 Phase 4 alert-status badge: only consult the alert ledger when the
// backend exposes the alerting capability (ops_alerting), so a deployment without
// the alert tables never tries to read them. Read via a string-indexed cast since
// the flag is not yet in the generated Features type.
const alertingEnabled = computed(
  () => (cap.data?.features as Record<string, boolean> | undefined)?.ops_alerting === true,
)

// ── Filter state ────────────────────────────────────────────────────
const filterStatus = ref<string | null>(null)
const filterType = ref<string | null>(null)
const filterConfidence = ref<string | null>(null)

// ── Incidents list state ────────────────────────────────────────────
const incidents = ref<OpsIncident[]>([])
const listLoading = ref(false)
const listError = ref<string | null>(null)
let listReqSeq = 0

async function fetchIncidents() {
  const reqSeq = ++listReqSeq
  listLoading.value = true
  listError.value = null
  const params: ListOpsIncidentParams = {}
  if (filterStatus.value) params.status = filterStatus.value
  if (filterType.value) params.incident_type = filterType.value
  if (filterConfidence.value) params.confidence = filterConfidence.value
  try {
    const res = await listOpsIncidents(params)
    if (reqSeq === listReqSeq) {
      incidents.value = res.items
    }
  } catch (e) {
    if (reqSeq === listReqSeq) {
      listError.value = e instanceof Error ? e.message : String(e)
    }
  } finally {
    if (reqSeq === listReqSeq) {
      listLoading.value = false
    }
  }
}

// ── Analytics state ──────────────────────────────────────────────────
const analytics = ref<OpsIncidentAnalytics | null>(null)
const analyticsLoading = ref(false)
const analyticsError = ref<string | null>(null)

async function fetchAnalytics() {
  analyticsLoading.value = true
  analyticsError.value = null
  try {
    analytics.value = await getOpsIncidentAnalytics()
  } catch (e) {
    analyticsError.value = e instanceof Error ? e.message : String(e)
  } finally {
    analyticsLoading.value = false
  }
}

onMounted(() => {
  void fetchAnalytics()
  void fetchIncidents()
})

// ── Drawer / detail state ───────────────────────────────────────────
const drawerOpen = ref(false)
const selected = ref<OpsIncident | null>(null)

function openDetail(row: OpsIncident) {
  selected.value = row
  drawerOpen.value = true
}

function closeDrawer() {
  drawerOpen.value = false
}

// ── Copy incident ID ────────────────────────────────────────────────
const copied = ref(false)

function copyId(id: string) {
  if (!navigator.clipboard) return
  void navigator.clipboard.writeText(id).then(() => {
    copied.value = true
    setTimeout(() => { copied.value = false }, 1500)
  }).catch(() => { copied.value = false })
}

// ── Table columns ────────────────────────────────────────────────────
const columns = computed<DataTableColumns<OpsIncident>>(() => [
  {
    title: t('diag.opsIncidents.col.createdAt'),
    key: 'created_at',
    width: 150,
    render: (row) => row.created_at.slice(0, 19).replace('T', ' '),
  },
  {
    title: t('diag.opsIncidents.col.type'),
    key: 'incident_type',
    width: 160,
    render: (row) => row.incident_type,
  },
  {
    title: t('diag.opsIncidents.col.status'),
    key: 'status',
    width: 100,
    render: (row) => row.status,
  },
  {
    title: t('diag.opsIncidents.col.confidence'),
    key: 'confidence',
    width: 100,
    render: (row) => row.confidence,
  },
  {
    title: t('diag.opsIncidents.col.runId'),
    key: 'run_id',
    width: 90,
    render: (row) => row.run_id ?? '—',
  },
  {
    title: t('diag.opsIncidents.col.sessionId'),
    key: 'session_id',
    width: 130,
    ellipsis: true,
    render: (row) => row.session_id ?? '—',
  },
  {
    title: t('diag.opsIncidents.col.topFinding'),
    key: 'top_finding',
    ellipsis: true,
    render: (row) => row.confirmed_findings[0] ?? '—',
  },
])

// ── Filter options ────────────────────────────────────────────────────
const statusOptions = [
  { label: 'open', value: 'open' },
  { label: 'resolved', value: 'resolved' },
  { label: 'suppressed', value: 'suppressed' },
]

const typeOptions = [
  { label: 'failed_ingestion', value: 'failed_ingestion' },
  { label: 'stale_session', value: 'stale_session' },
  { label: 'proxy_exhaustion', value: 'proxy_exhaustion' },
  { label: 'login_failure', value: 'login_failure' },
]

const confidenceOptions = [
  { label: 'low', value: 'low' },
  { label: 'medium', value: 'medium' },
  { label: 'high', value: 'high' },
]

// ── Tag type helpers ──────────────────────────────────────────────────
function confidenceTagType(c: string): 'error' | 'warning' | 'success' | 'default' {
  if (c === 'high') return 'error'
  if (c === 'medium') return 'warning'
  if (c === 'low') return 'success'
  return 'default'
}

function statusTagType(s: string): 'success' | 'error' | 'warning' | 'default' {
  if (s === 'open') return 'error'
  if (s === 'resolved') return 'success'
  if (s === 'suppressed') return 'warning'
  return 'default'
}

function evidenceKindTag(kind: string): 'default' | 'info' {
  return kind === 'gh_run' ? 'info' : 'default'
}

// ── Computed analytics rows for descriptions ────────────────────────
const analyticsByType = computed(() =>
  analytics.value ? Object.entries(analytics.value.by_type) : [],
)
const analyticsByStatus = computed(() =>
  analytics.value ? Object.entries(analytics.value.by_status) : [],
)
const analyticsByConfidence = computed(() =>
  analytics.value ? Object.entries(analytics.value.by_confidence) : [],
)

// ── Remediation proposals state ──────────────────────────────────────
const proposals = ref<OpsRemediationProposal[]>([])
const proposalsLoading = ref(false)
const proposalsError = ref<string | null>(null)
const copiedCommand = ref<string | null>(null)

let proposalsReqSeq = 0

async function fetchProposals(incidentId: string) {
  // Guard against out-of-order responses when the user switches incidents
  // quickly — a slower earlier request must not overwrite a newer selection
  // (mirrors fetchIncidents' listReqSeq pattern).
  const reqSeq = ++proposalsReqSeq
  proposalsLoading.value = true
  proposalsError.value = null
  proposals.value = []
  try {
    const res = await listRemediationProposals(incidentId)
    if (reqSeq === proposalsReqSeq) {
      proposals.value = res.items
    }
  } catch (e) {
    if (reqSeq === proposalsReqSeq) {
      proposalsError.value = extractErrorMessage(e)
    }
  } finally {
    if (reqSeq === proposalsReqSeq) {
      proposalsLoading.value = false
    }
  }
}

// ── Alert events (ADR-026 Phase 4) ───────────────────────────────────
const alertEvents = ref<OpsAlertEvent[]>([])
let alertEventsReqSeq = 0

async function fetchAlertEvents(incidentId: string) {
  const reqSeq = ++alertEventsReqSeq
  alertEvents.value = []
  if (!alertingEnabled.value) return
  try {
    const res = await listAlertEvents(incidentId)
    if (reqSeq === alertEventsReqSeq) {
      alertEvents.value = res.items
    }
  } catch {
    // Best-effort: the alert-status badge is informational. If the read fails,
    // fall back to "no alert" rather than disrupting the incident detail drawer.
    if (reqSeq === alertEventsReqSeq) alertEvents.value = []
  }
}

// Events come back ordered by fired_at ASC, so the last item is the latest.
const latestAlertEvent = computed<OpsAlertEvent | null>(() =>
  alertEvents.value.length ? alertEvents.value[alertEvents.value.length - 1] : null,
)

function alertStatusTagType(status: OpsAlertEvent['status']): 'success' | 'default' {
  return status === 'fired' ? 'success' : 'default'
}

watch(selected, (inc) => {
  if (inc) {
    void fetchProposals(inc.incident_id)
    void fetchAlertEvents(inc.incident_id)
  } else {
    proposals.value = []
    proposalsError.value = null
    alertEvents.value = []
  }
})

function copyCommand(cmd: string, proposalId: string) {
  if (!navigator.clipboard) return
  void navigator.clipboard.writeText(cmd).then(() => {
    copiedCommand.value = proposalId
    setTimeout(() => { copiedCommand.value = null }, 1500)
  }).catch(() => { copiedCommand.value = null })
}

function proposalStatusTagType(s: string): 'default' | 'success' | 'error' | 'warning' {
  if (s === 'approved') return 'success'
  if (s === 'rejected') return 'error'
  if (s === 'expired') return 'warning'
  return 'default'
}

function safetyLevelTagType(level: string): 'default' | 'success' | 'warning' | 'error' {
  if (level === 'safe_to_prepare') return 'success'
  if (level === 'requires_review') return 'warning'
  if (level === 'blocked') return 'error'
  return 'default'
}

// ── Decision modal state ─────────────────────────────────────────────
const decisionModalVisible = ref(false)
const decisionTarget = ref<OpsRemediationProposal | null>(null)
const decisionAction = ref<'approved' | 'rejected'>('approved')
const decisionNote = ref('')
const decisionLoading = ref(false)

function openDecisionModal(proposal: OpsRemediationProposal, action: 'approved' | 'rejected') {
  decisionTarget.value = proposal
  decisionAction.value = action
  decisionNote.value = ''
  decisionModalVisible.value = true
}

function closeDecisionModal() {
  decisionModalVisible.value = false
}

async function submitDecision() {
  if (!decisionTarget.value) return
  decisionLoading.value = true
  try {
    const body: RemediationDecisionRequest = {
      status: decisionAction.value,
      decision_note: decisionNote.value.trim() || null,
    }
    await decideRemediationProposal(decisionTarget.value.proposal_id, body)
    message.success(t('diag.opsIncidents.proposals.decisionSuccess'))
    decisionModalVisible.value = false
    if (selected.value) {
      void fetchProposals(selected.value.incident_id)
    }
  } catch (e) {
    message.error(`${t('diag.opsIncidents.proposals.decisionError')} ${extractErrorMessage(e)}`)
  } finally {
    decisionLoading.value = false
  }
}
</script>

<template>
  <div class="ops-incidents-page">
    <!-- Page header -->
    <header class="page-header">
      <div class="page-header-left">
        <h1>{{ t('diag.opsIncidents.title') }}</h1>
        <p class="subtitle">
          {{ t('diag.opsIncidents.subtitle') }}
        </p>
      </div>
      <NButton
        size="small"
        :loading="listLoading || analyticsLoading"
        @click="() => { void fetchIncidents(); void fetchAnalytics() }"
      >
        {{ t('common.retry') }}
      </NButton>
    </header>

    <!-- Operator alerting config (capability-gated; renders nothing when off) -->
    <AlertPolicyPanel />

    <!-- Analytics summary -->
    <NCard :title="t('diag.opsIncidents.analytics')">
      <NAlert
        v-if="analyticsError"
        type="error"
        :title="t('errors.generic.title')"
        closable
        style="margin-bottom: 12px"
        @close="analyticsError = null"
      >
        {{ analyticsError }}
      </NAlert>

      <NSpin :show="analyticsLoading">
        <div
          v-if="analytics"
          class="analytics-grid"
        >
          <div class="analytics-stat">
            <div class="analytics-stat-label">
              {{ t('diag.opsIncidents.analyticsTotal') }}
            </div>
            <div class="analytics-stat-value">
              {{ analytics.total }}
            </div>
          </div>
          <div class="analytics-stat">
            <div class="analytics-stat-label">
              {{ t('diag.opsIncidents.analyticsHighConf') }}
            </div>
            <div class="analytics-stat-value">
              <NTag
                size="small"
                :type="analytics.open_high_confidence > 0 ? 'error' : 'success'"
              >
                {{ analytics.open_high_confidence }}
              </NTag>
            </div>
          </div>

          <NDescriptions
            v-if="analyticsByType.length"
            :title="t('diag.opsIncidents.analyticsByType')"
            bordered
            :column="3"
            label-placement="left"
            style="grid-column: span 2"
          >
            <NDescriptionsItem
              v-for="[type, count] in analyticsByType"
              :key="type"
              :label="type"
            >
              {{ count }}
            </NDescriptionsItem>
          </NDescriptions>

          <NDescriptions
            v-if="analyticsByStatus.length"
            :title="t('diag.opsIncidents.analyticsByStatus')"
            bordered
            :column="3"
            label-placement="left"
            style="grid-column: span 1"
          >
            <NDescriptionsItem
              v-for="[status, count] in analyticsByStatus"
              :key="status"
              :label="status"
            >
              {{ count }}
            </NDescriptionsItem>
          </NDescriptions>

          <NDescriptions
            v-if="analyticsByConfidence.length"
            :title="t('diag.opsIncidents.analyticsByConf')"
            bordered
            :column="3"
            label-placement="left"
            style="grid-column: span 1"
          >
            <NDescriptionsItem
              v-for="[conf, count] in analyticsByConfidence"
              :key="conf"
              :label="conf"
            >
              {{ count }}
            </NDescriptionsItem>
          </NDescriptions>
        </div>
        <div
          v-else-if="!analyticsLoading && !analyticsError"
          class="empty-hint"
        >
          {{ t('diag.opsIncidents.empty') }}
        </div>
      </NSpin>
    </NCard>

    <!-- Filters + table -->
    <NCard :title="t('diag.opsIncidents.title')">
      <NSpace
        :size="8"
        style="margin-bottom: 12px"
        wrap
      >
        <NSelect
          v-model:value="filterStatus"
          :options="statusOptions"
          :placeholder="t('diag.opsIncidents.filterStatus')"
          clearable
          size="small"
          style="width: 160px"
          @update:value="() => void fetchIncidents()"
        />
        <NSelect
          v-model:value="filterType"
          :options="typeOptions"
          :placeholder="t('diag.opsIncidents.filterType')"
          clearable
          size="small"
          style="width: 180px"
          @update:value="() => void fetchIncidents()"
        />
        <NSelect
          v-model:value="filterConfidence"
          :options="confidenceOptions"
          :placeholder="t('diag.opsIncidents.filterConfidence')"
          clearable
          size="small"
          style="width: 150px"
          @update:value="() => void fetchIncidents()"
        />
      </NSpace>

      <NAlert
        v-if="listError"
        type="error"
        :title="t('errors.generic.title')"
        closable
        style="margin-bottom: 12px"
        @close="listError = null"
      >
        {{ listError }}
      </NAlert>

      <NSpin :show="listLoading">
        <div
          v-if="!listLoading && incidents.length === 0 && !listError"
          class="empty-hint"
        >
          {{ t('diag.opsIncidents.empty') }}
        </div>
        <NDataTable
          v-else
          :columns="columns"
          :data="incidents"
          :row-props="(row: OpsIncident) => ({ style: 'cursor: pointer', onClick: () => openDetail(row) })"
          size="small"
          :scroll-x="900"
        />
      </NSpin>
    </NCard>

    <!-- Detail drawer -->
    <NDrawer
      v-model:show="drawerOpen"
      :width="560"
      placement="right"
    >
      <NDrawerContent
        v-if="selected"
        :title="selected.incident_id"
        closable
        @after-leave="closeDrawer"
      >
        <!-- ID + copy -->
        <NSpace
          align="center"
          :size="8"
          style="margin-bottom: 16px"
        >
          <code class="incident-id">{{ selected.incident_id }}</code>
          <NButton
            size="tiny"
            @click="copyId(selected!.incident_id)"
          >
            {{ copied ? t('diag.opsIncidents.copied') : t('diag.opsIncidents.copyId') }}
          </NButton>
        </NSpace>

        <!-- Summary -->
        <NDescriptions
          bordered
          :column="1"
          label-placement="left"
          style="margin-bottom: 16px"
        >
          <NDescriptionsItem :label="t('diag.opsIncidents.col.type')">
            {{ selected.incident_type }}
          </NDescriptionsItem>
          <NDescriptionsItem :label="t('diag.opsIncidents.col.status')">
            <NTag
              size="small"
              :type="statusTagType(selected.status)"
            >
              {{ selected.status }}
            </NTag>
          </NDescriptionsItem>
          <NDescriptionsItem :label="t('diag.opsIncidents.col.confidence')">
            <NTag
              size="small"
              :type="confidenceTagType(selected.confidence)"
            >
              {{ selected.confidence }}
            </NTag>
          </NDescriptionsItem>
          <NDescriptionsItem
            v-if="alertingEnabled"
            :label="t('diag.opsIncidents.alertStatus.label')"
          >
            <NTag
              v-if="latestAlertEvent"
              size="small"
              :type="alertStatusTagType(latestAlertEvent.status)"
            >
              {{ t(`diag.opsIncidents.alertStatus.${latestAlertEvent.status}`, latestAlertEvent.status) }}
            </NTag>
            <span v-else>{{ t('diag.opsIncidents.alertStatus.none') }}</span>
          </NDescriptionsItem>
          <NDescriptionsItem :label="t('diag.opsIncidents.col.runId')">
            {{ selected.run_id ?? '—' }}
          </NDescriptionsItem>
          <NDescriptionsItem :label="t('diag.opsIncidents.col.sessionId')">
            {{ selected.session_id ?? '—' }}
          </NDescriptionsItem>
          <NDescriptionsItem :label="t('diag.opsIncidents.col.createdAt')">
            {{ selected.created_at }}
          </NDescriptionsItem>
          <NDescriptionsItem
            v-if="selected.resolved_at"
            :label="t('diag.opsIncidents.resolvedAt')"
          >
            {{ selected.resolved_at }}
          </NDescriptionsItem>
          <NDescriptionsItem :label="t('diag.opsIncidents.modelVersion')">
            {{ selected.model_version }}
          </NDescriptionsItem>
          <NDescriptionsItem :label="t('diag.opsIncidents.detectorVersion')">
            {{ selected.detector_version }}
          </NDescriptionsItem>
        </NDescriptions>

        <!-- Confirmed findings -->
        <div
          v-if="selected.confirmed_findings.length"
          class="detail-section"
        >
          <div class="detail-section-title">
            {{ t('diag.opsIncidents.findings') }}
          </div>
          <ul class="dense-list">
            <li
              v-for="(finding, i) in selected.confirmed_findings"
              :key="i"
            >
              {{ finding }}
            </li>
          </ul>
        </div>

        <!-- Likely causes -->
        <div
          v-if="selected.likely_causes.length"
          class="detail-section"
        >
          <div class="detail-section-title">
            {{ t('diag.opsIncidents.causes') }}
          </div>
          <ul class="dense-list">
            <li
              v-for="(cause, i) in selected.likely_causes"
              :key="i"
            >
              {{ cause }}
            </li>
          </ul>
        </div>

        <!-- Unknowns -->
        <div
          v-if="selected.unknowns.length"
          class="detail-section"
        >
          <div class="detail-section-title">
            {{ t('diag.opsIncidents.unknowns') }}
          </div>
          <ul class="dense-list">
            <li
              v-for="(unknown, i) in selected.unknowns"
              :key="i"
            >
              {{ unknown }}
            </li>
          </ul>
        </div>

        <!-- Recommended next actions -->
        <div
          v-if="selected.recommended_next_actions.length"
          class="detail-section"
        >
          <div class="detail-section-title">
            {{ t('diag.opsIncidents.nextActions') }}
          </div>
          <ul class="dense-list">
            <li
              v-for="(action, i) in selected.recommended_next_actions"
              :key="i"
            >
              {{ action }}
            </li>
          </ul>
        </div>

        <!-- Unsafe actions -->
        <div
          v-if="selected.unsafe_actions.length"
          class="detail-section detail-section--warn"
        >
          <div class="detail-section-title">
            {{ t('diag.opsIncidents.unsafeActions') }}
          </div>
          <ul class="dense-list">
            <li
              v-for="(ua, i) in selected.unsafe_actions"
              :key="i"
            >
              {{ ua }}
            </li>
          </ul>
        </div>

        <!-- Evidence refs -->
        <div
          v-if="selected.evidence_refs.length"
          class="detail-section"
        >
          <div class="detail-section-title">
            {{ t('diag.opsIncidents.evidence') }}
          </div>
          <div
            v-for="(evRef, i) in selected.evidence_refs"
            :key="i"
            class="evidence-row"
          >
            <NTag
              size="small"
              :type="evidenceKindTag(evRef.kind)"
            >
              {{ evRef.kind }}
            </NTag>
            <span class="evidence-ref">{{ evRef.label ?? evRef.ref }}</span>
          </div>
        </div>

        <!-- Remediation proposals -->
        <div class="detail-section proposals-section">
          <div class="detail-section-title">
            {{ t('diag.opsIncidents.proposals.title') }}
          </div>

          <NAlert
            v-if="proposalsError"
            type="error"
            size="small"
            style="margin-bottom: 8px"
          >
            {{ proposalsError }}
          </NAlert>

          <NSpin :show="proposalsLoading">
            <div
              v-if="!proposalsLoading && proposals.length === 0 && !proposalsError"
              class="empty-hint"
              style="padding: 12px 0"
            >
              {{ t('diag.opsIncidents.proposals.empty') }}
            </div>

            <div
              v-for="proposal in proposals"
              :key="proposal.proposal_id"
              class="proposal-card"
            >
              <!-- Proposal header row -->
              <div class="proposal-header">
                <span class="proposal-title">{{ proposal.title }}</span>
                <NSpace :size="4">
                  <NTag
                    size="small"
                    :type="safetyLevelTagType(proposal.safety_level)"
                  >
                    {{ t(`diag.opsIncidents.proposals.safety.${proposal.safety_level}`, proposal.safety_level) }}
                  </NTag>
                  <NTag
                    size="small"
                    :type="proposalStatusTagType(proposal.status)"
                  >
                    {{ t(`diag.opsIncidents.proposals.status.${proposal.status}`, proposal.status) }}
                  </NTag>
                </NSpace>
              </div>

              <!-- Proposal details -->
              <NDescriptions
                bordered
                :column="1"
                label-placement="left"
                size="small"
                style="margin: 8px 0"
              >
                <NDescriptionsItem :label="t('diag.opsIncidents.proposals.actionType')">
                  {{ proposal.action_type }}
                </NDescriptionsItem>
                <NDescriptionsItem :label="t('diag.opsIncidents.proposals.rationale')">
                  {{ proposal.rationale }}
                </NDescriptionsItem>
                <NDescriptionsItem
                  v-if="proposal.runbook_ref"
                  :label="t('diag.opsIncidents.proposals.runbookRef')"
                >
                  <code class="proposal-code-inline">{{ proposal.runbook_ref }}</code>
                </NDescriptionsItem>
                <NDescriptionsItem :label="t('diag.opsIncidents.proposals.proposedBy')">
                  {{ proposal.proposed_by }}
                </NDescriptionsItem>
                <NDescriptionsItem
                  v-if="proposal.decided_by"
                  :label="t('diag.opsIncidents.proposals.decidedBy')"
                >
                  {{ proposal.decided_by }}
                </NDescriptionsItem>
                <NDescriptionsItem
                  v-if="proposal.decision_note"
                  :label="t('diag.opsIncidents.proposals.decisionNote')"
                >
                  {{ proposal.decision_note }}
                </NDescriptionsItem>
                <NDescriptionsItem
                  v-if="proposal.decided_at"
                  :label="t('diag.opsIncidents.proposals.decidedAt')"
                >
                  {{ proposal.decided_at }}
                </NDescriptionsItem>
              </NDescriptions>

              <!-- Required checks -->
              <div
                v-if="proposal.required_checks.length"
                class="proposal-list-block"
              >
                <div class="proposal-list-label">
                  {{ t('diag.opsIncidents.proposals.requiredChecks') }}
                </div>
                <ul class="dense-list">
                  <li
                    v-for="(check, ci) in proposal.required_checks"
                    :key="ci"
                  >
                    {{ check }}
                  </li>
                </ul>
              </div>

              <!-- Blocked reasons -->
              <div
                v-if="proposal.blocked_reasons.length"
                class="proposal-list-block proposal-list-block--blocked"
              >
                <div class="proposal-list-label proposal-list-label--blocked">
                  {{ t('diag.opsIncidents.proposals.blockedReasons') }}
                </div>
                <ul class="dense-list">
                  <li
                    v-for="(reason, ri) in proposal.blocked_reasons"
                    :key="ri"
                  >
                    {{ reason }}
                  </li>
                </ul>
              </div>

              <!-- Command preview — read-only, copyable code block -->
              <div
                v-if="proposal.command_preview"
                class="proposal-command-block"
              >
                <div class="proposal-command-label">
                  {{ t('diag.opsIncidents.proposals.commandPreview') }}
                </div>
                <div class="proposal-command-row">
                  <pre class="proposal-command-pre">{{ proposal.command_preview }}</pre>
                  <NButton
                    size="tiny"
                    style="flex-shrink: 0; align-self: flex-start"
                    @click="copyCommand(proposal.command_preview!, proposal.proposal_id)"
                  >
                    {{ copiedCommand === proposal.proposal_id
                      ? t('diag.opsIncidents.proposals.copiedCommand')
                      : t('diag.opsIncidents.proposals.copyCommand') }}
                  </NButton>
                </div>
              </div>

              <!-- Approve / Reject actions — admins only, and only for proposals
                   still in 'proposed' status (the decision POST requires admin). -->
              <NSpace
                v-if="isAdmin && proposal.status === 'proposed'"
                :size="8"
                style="margin-top: 10px"
              >
                <NButton
                  size="small"
                  type="success"
                  :disabled="proposal.safety_level === 'blocked'"
                  :title="proposal.safety_level === 'blocked' ? t('diag.opsIncidents.proposals.approveDisabledBlocked') : undefined"
                  @click="openDecisionModal(proposal, 'approved')"
                >
                  {{ t('diag.opsIncidents.proposals.approve') }}
                </NButton>
                <NButton
                  size="small"
                  type="error"
                  @click="openDecisionModal(proposal, 'rejected')"
                >
                  {{ t('diag.opsIncidents.proposals.reject') }}
                </NButton>
              </NSpace>
            </div>
          </NSpin>
        </div>
      </NDrawerContent>
    </NDrawer>

    <!-- Decision confirmation modal -->
    <NModal
      v-model:show="decisionModalVisible"
      :mask-closable="!decisionLoading"
    >
      <NCard
        style="max-width: 480px"
        :title="decisionAction === 'approved'
          ? t('diag.opsIncidents.proposals.confirmApproveTitle')
          : t('diag.opsIncidents.proposals.confirmRejectTitle')"
        :bordered="false"
        role="dialog"
        aria-modal="true"
      >
        <NSpace
          vertical
          :size="12"
        >
          <p
            v-if="decisionTarget"
            style="margin: 0; font-size: 13px"
          >
            {{ t('diag.opsIncidents.proposals.confirmBody', { title: decisionTarget.title }) }}
          </p>
          <NInput
            v-model:value="decisionNote"
            type="textarea"
            :placeholder="t('diag.opsIncidents.proposals.decisionNotePlaceholder')"
            :autosize="{ minRows: 2, maxRows: 5 }"
            :disabled="decisionLoading"
          />
        </NSpace>

        <template #footer>
          <NSpace
            justify="end"
            :size="8"
          >
            <NButton
              :disabled="decisionLoading"
              @click="closeDecisionModal"
            >
              {{ t('common.cancel') }}
            </NButton>
            <NButton
              :type="decisionAction === 'approved' ? 'success' : 'error'"
              :loading="decisionLoading"
              @click="submitDecision"
            >
              {{ decisionAction === 'approved'
                ? t('diag.opsIncidents.proposals.approve')
                : t('diag.opsIncidents.proposals.reject') }}
            </NButton>
          </NSpace>
        </template>
      </NCard>
    </NModal>
  </div>
</template>

<style scoped>
.ops-incidents-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.page-header-left h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
}

.subtitle {
  color: var(--n-text-color-2);
  font-size: 13px;
  margin-top: 4px;
}

.empty-hint {
  color: var(--n-text-color-3);
  font-size: 13px;
  text-align: center;
  padding: 24px 0;
}

.analytics-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.analytics-stat {
  padding: 12px 16px;
  border: 1px solid var(--n-border-color);
  border-radius: 4px;
}

.analytics-stat-label {
  font-size: 12px;
  color: var(--n-text-color-3);
  margin-bottom: 4px;
}

.analytics-stat-value {
  font-size: 24px;
  font-weight: 700;
}

.incident-id {
  font-size: 12px;
  word-break: break-all;
}

.detail-section {
  margin-bottom: 16px;
}

.detail-section--warn .detail-section-title {
  color: var(--n-warning-color);
}

.detail-section-title {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--n-text-color-3);
  margin-bottom: 6px;
}

.dense-list {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  line-height: 1.8;
}

.evidence-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 12px;
}

.evidence-ref {
  word-break: break-all;
  color: var(--n-text-color-2);
}

/* Proposals section */
.proposals-section {
  border-top: 1px solid var(--n-border-color);
  padding-top: 16px;
}

.proposal-card {
  border: 1px solid var(--n-border-color);
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 12px;
  background: var(--n-card-color);
}

.proposal-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 4px;
}

.proposal-title {
  font-size: 13px;
  font-weight: 600;
}

.proposal-code-inline {
  font-size: 12px;
  word-break: break-all;
}

.proposal-list-block {
  margin: 8px 0 4px;
}

.proposal-list-block--blocked {
  background: rgba(var(--n-error-color-rgb, 255, 0, 0), 0.04);
  border-left: 3px solid var(--n-error-color);
  padding-left: 8px;
  border-radius: 0 4px 4px 0;
}

.proposal-list-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--n-text-color-3);
  margin-bottom: 4px;
}

.proposal-list-label--blocked {
  color: var(--n-error-color);
}

.proposal-command-block {
  margin: 8px 0 4px;
}

.proposal-command-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--n-text-color-3);
  margin-bottom: 4px;
}

.proposal-command-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.proposal-command-pre {
  flex: 1;
  margin: 0;
  padding: 8px 10px;
  font-size: 12px;
  font-family: var(--n-font-family-mono, monospace);
  background: var(--n-code-color, rgba(0, 0, 0, 0.06));
  border-radius: 4px;
  border: 1px solid var(--n-border-color);
  white-space: pre-wrap;
  word-break: break-all;
  user-select: text;
  pointer-events: text;
  /* Explicitly not a control — text only */
  cursor: text;
}
</style>
