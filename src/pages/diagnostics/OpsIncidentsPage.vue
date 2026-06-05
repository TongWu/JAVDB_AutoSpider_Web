<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
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
  NSelect,
  NSpace,
  NSpin,
  NTag,
} from 'naive-ui'
import type { DataTableColumns } from 'naive-ui'
import {
  getOpsIncidentAnalytics,
  listOpsIncidents,
  type ListOpsIncidentParams,
  type OpsIncident,
  type OpsIncidentAnalytics,
} from '@/api/diagnostics'

const { t } = useI18n()

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
      :width="520"
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
      </NDrawerContent>
    </NDrawer>
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
</style>
