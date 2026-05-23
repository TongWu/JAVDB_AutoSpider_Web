<script setup lang="ts">
import { computed, h, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NAlert,
  NButton,
  NCard,
  NDataTable,
  NDrawer,
  NDrawerContent,
  NInput,
  NMenu,
  NModal,
  NSpace,
  NTag,
  type DataTableColumns,
} from 'naive-ui'
import {
  listWorkflows,
  listRuns,
  dispatchWorkflow,
  getRunLogs,
  type WorkflowItem,
  type RunItem,
} from '@/api/gh-actions'

const { t } = useI18n()

// ── Workflow list state ─────────────────────────────────────────────
const workflows = ref<WorkflowItem[]>([])
const workflowsLoading = ref(false)
const workflowsError = ref<string | null>(null)
const selectedWorkflowId = ref<number | null>(null)

async function fetchWorkflows() {
  workflowsLoading.value = true
  workflowsError.value = null
  try {
    const res = await listWorkflows()
    workflows.value = res.workflows
  } catch (e) {
    workflowsError.value = e instanceof Error ? e.message : String(e)
  } finally {
    workflowsLoading.value = false
  }
}

// ── Runs state ──────────────────────────────────────────────────────
const runs = ref<RunItem[]>([])
const runsLoading = ref(false)
const runsError = ref<string | null>(null)

async function fetchRuns() {
  if (!selectedWorkflowId.value) return
  runsLoading.value = true
  runsError.value = null
  try {
    const res = await listRuns(selectedWorkflowId.value)
    runs.value = res.runs
  } catch (e) {
    runsError.value = e instanceof Error ? e.message : String(e)
  } finally {
    runsLoading.value = false
  }
}

watch(selectedWorkflowId, () => {
  runs.value = []
  void fetchRuns()
})

// ── Auto-refresh (every 15s, pause when page hidden) ────────────────
let refreshTimer: ReturnType<typeof setInterval> | null = null

function startAutoRefresh() {
  stopAutoRefresh()
  refreshTimer = setInterval(() => {
    if (!document.hidden && selectedWorkflowId.value) {
      void fetchRuns()
    }
  }, 15_000)
}

function stopAutoRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
}

onMounted(() => {
  void fetchWorkflows()
  startAutoRefresh()
})

onUnmounted(() => {
  stopAutoRefresh()
})

// ── Workflow menu items ─────────────────────────────────────────────
function statusDot(conclusion?: string, status?: string): string {
  if (conclusion === 'success') return '🟢'
  if (conclusion === 'failure') return '🔴'
  if (status === 'in_progress' || status === 'queued') return '🟡'
  return '⚪'
}

const workflowMenuOptions = computed(() =>
  workflows.value.map((w) => ({
    label: `${statusDot(w.last_run?.conclusion, w.last_run?.status)} ${w.name}`,
    key: String(w.id),
  })),
)

function onWorkflowSelect(key: string) {
  selectedWorkflowId.value = Number(key)
}

// ── Runs table columns ──────────────────────────────────────────────
function conclusionTagType(
  conclusion?: string,
  status?: string,
): 'success' | 'error' | 'warning' | 'info' | 'default' {
  if (conclusion === 'success') return 'success'
  if (conclusion === 'failure') return 'error'
  if (conclusion === 'cancelled') return 'warning'
  if (status === 'in_progress' || status === 'queued') return 'warning'
  return 'default'
}

const runsColumns = computed<DataTableColumns<RunItem>>(() => [
  {
    title: '#',
    key: 'run_number',
    width: 70,
    render: (row) => row.run_number ?? '—',
  },
  {
    title: t('ghActions.col.title'),
    key: 'display_title',
    ellipsis: { tooltip: true },
    minWidth: 200,
    render: (row) => row.display_title || row.name || '—',
  },
  {
    title: t('ghActions.col.status'),
    key: 'status',
    width: 130,
    render: (row) => {
      const label = row.conclusion || row.status || '—'
      return h(
        NTag,
        { size: 'small', round: true, type: conclusionTagType(row.conclusion, row.status) },
        () => label,
      )
    },
  },
  {
    title: t('ghActions.col.event'),
    key: 'event',
    width: 120,
    render: (row) =>
      row.event ? h(NTag, { size: 'small', round: true }, () => row.event) : '—',
  },
  {
    title: t('ghActions.col.createdAt'),
    key: 'created_at',
    width: 170,
    render: (row) =>
      row.created_at ? new Date(row.created_at).toLocaleString() : '—',
  },
  {
    title: t('ghActions.col.sha'),
    key: 'head_sha',
    width: 100,
    render: (row) => (row.head_sha ? row.head_sha.slice(0, 7) : '—'),
  },
])

// ── Run detail drawer ───────────────────────────────────────────────
const drawerVisible = ref(false)
const selectedRun = ref<RunItem | null>(null)
const logsLoading = ref(false)

function onRowClick(row: RunItem) {
  selectedRun.value = row
  drawerVisible.value = true
}

async function openLogs() {
  if (!selectedRun.value) return
  logsLoading.value = true
  try {
    const res = await getRunLogs(selectedRun.value.id)
    window.open(res.logs_url, '_blank')
  } catch {
    // global error toast handles this
  } finally {
    logsLoading.value = false
  }
}

const rowProps = (row: RunItem) => ({
  style: 'cursor: pointer',
  onClick: () => onRowClick(row),
})

// ── Dispatch modal ──────────────────────────────────────────────────
const dispatchModalVisible = ref(false)
const dispatchRef = ref('main')
const dispatchInputsJson = ref('{}')
const dispatchLoading = ref(false)
const dispatchError = ref<string | null>(null)
const dispatchSuccess = ref(false)

function openDispatchModal() {
  dispatchRef.value = 'main'
  dispatchInputsJson.value = '{}'
  dispatchError.value = null
  dispatchSuccess.value = false
  dispatchModalVisible.value = true
}

async function submitDispatch() {
  const wfId = selectedWorkflowId.value ?? workflows.value[0]?.id
  if (!wfId) return
  dispatchLoading.value = true
  dispatchError.value = null
  dispatchSuccess.value = false
  try {
    let inputs: Record<string, string> | undefined
    const trimmed = dispatchInputsJson.value.trim()
    if (trimmed && trimmed !== '{}') {
      inputs = JSON.parse(trimmed) as Record<string, string>
    }
    await dispatchWorkflow({
      workflow_id: wfId,
      ref: dispatchRef.value || 'main',
      inputs,
    })
    dispatchSuccess.value = true
    // Refresh runs after a short delay for GitHub to register the dispatch
    setTimeout(() => void fetchRuns(), 3000)
  } catch (e) {
    dispatchError.value = e instanceof Error ? e.message : String(e)
  } finally {
    dispatchLoading.value = false
  }
}

const selectedWorkflowName = computed(
  () => workflows.value.find((w) => w.id === selectedWorkflowId.value)?.name ?? '',
)
</script>

<template>
  <div class="runs-page">
    <header class="page-header">
      <div class="page-header-left">
        <h1>{{ t('nav.githubActions') }}</h1>
        <p class="subtitle">
          {{ t('ghActions.subtitle') }}
        </p>
      </div>
      <NButton
        type="primary"
        size="small"
        @click="openDispatchModal"
      >
        {{ t('ghActions.dispatch') }}
      </NButton>
    </header>

    <div class="runs-layout">
      <!-- Workflow sidebar -->
      <NCard
        class="workflow-list"
        :title="t('nav.workflows')"
        size="small"
      >
        <template #header-extra>
          <NButton
            size="tiny"
            :loading="workflowsLoading"
            @click="fetchWorkflows"
          >
            {{ t('common.retry') }}
          </NButton>
        </template>

        <NAlert
          v-if="workflowsError"
          type="error"
          closable
          style="margin-bottom: 8px"
          @close="workflowsError = null"
        >
          {{ workflowsError }}
        </NAlert>

        <NMenu
          :options="workflowMenuOptions"
          :value="selectedWorkflowId != null ? String(selectedWorkflowId) : undefined"
          @update:value="onWorkflowSelect"
        />
      </NCard>

      <!-- Runs table -->
      <NCard
        class="runs-main"
        size="small"
      >
        <template #header>
          <span v-if="selectedWorkflowName">
            {{ selectedWorkflowName }}
          </span>
          <span v-else>{{ t('ghActions.selectWorkflow') }}</span>
        </template>
        <template #header-extra>
          <NButton
            size="tiny"
            :loading="runsLoading"
            :disabled="!selectedWorkflowId"
            @click="fetchRuns"
          >
            {{ t('common.retry') }}
          </NButton>
        </template>

        <NAlert
          v-if="runsError"
          type="error"
          closable
          style="margin-bottom: 8px"
          @close="runsError = null"
        >
          {{ runsError }}
        </NAlert>

        <NDataTable
          :columns="runsColumns"
          :data="runs"
          :loading="runsLoading"
          :row-key="(row: RunItem) => row.id"
          :row-props="rowProps"
          striped
          :max-height="520"
        />
      </NCard>
    </div>

    <!-- Run detail drawer -->
    <NDrawer
      v-model:show="drawerVisible"
      :width="400"
      placement="right"
    >
      <NDrawerContent :title="selectedRun?.display_title || selectedRun?.name || t('ghActions.runDetail')">
        <div
          v-if="selectedRun"
          class="run-detail"
        >
          <div class="detail-row">
            <span class="detail-label">#</span>
            <span>{{ selectedRun.run_number ?? '—' }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">{{ t('ghActions.col.status') }}</span>
            <NTag
              size="small"
              round
              :type="conclusionTagType(selectedRun.conclusion, selectedRun.status)"
            >
              {{ selectedRun.conclusion || selectedRun.status || '—' }}
            </NTag>
          </div>
          <div class="detail-row">
            <span class="detail-label">{{ t('ghActions.col.event') }}</span>
            <span>{{ selectedRun.event || '—' }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">{{ t('ghActions.col.createdAt') }}</span>
            <span>{{ selectedRun.created_at ? new Date(selectedRun.created_at).toLocaleString() : '—' }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">{{ t('ghActions.col.sha') }}</span>
            <span>{{ selectedRun.head_sha ? selectedRun.head_sha.slice(0, 7) : '—' }}</span>
          </div>
          <NButton
            type="primary"
            size="small"
            :loading="logsLoading"
            style="margin-top: 16px"
            @click="openLogs"
          >
            {{ t('ghActions.viewLogs') }}
          </NButton>
        </div>
      </NDrawerContent>
    </NDrawer>

    <!-- Dispatch modal -->
    <NModal
      v-model:show="dispatchModalVisible"
      preset="card"
      :title="t('ghActions.dispatchTitle')"
      style="width: 480px"
    >
      <NSpace
        vertical
        :size="12"
      >
        <div>
          <span class="form-label">{{ t('ghActions.workflowLabel') }}</span>
          <span class="form-value">{{ selectedWorkflowName || t('ghActions.selectWorkflow') }}</span>
        </div>
        <div>
          <span class="form-label">{{ t('ghActions.refLabel') }}</span>
          <NInput
            v-model:value="dispatchRef"
            size="small"
            placeholder="main"
          />
        </div>
        <div>
          <span class="form-label">{{ t('ghActions.inputsLabel') }}</span>
          <NInput
            v-model:value="dispatchInputsJson"
            type="textarea"
            size="small"
            :rows="4"
            placeholder="{}"
          />
        </div>

        <NAlert
          v-if="dispatchError"
          type="error"
          closable
          @close="dispatchError = null"
        >
          {{ dispatchError }}
        </NAlert>

        <NAlert
          v-if="dispatchSuccess"
          type="success"
        >
          {{ t('ghActions.dispatched') }}
        </NAlert>

        <NSpace justify="end">
          <NButton
            size="small"
            @click="dispatchModalVisible = false"
          >
            {{ t('common.cancel') }}
          </NButton>
          <NButton
            type="primary"
            size="small"
            :loading="dispatchLoading"
            @click="submitDispatch"
          >
            {{ t('common.submit') }}
          </NButton>
        </NSpace>
      </NSpace>
    </NModal>
  </div>
</template>

<style scoped>
.runs-page {
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
.runs-layout {
  display: flex;
  gap: 16px;
}
.workflow-list {
  width: 260px;
  flex-shrink: 0;
}
.runs-main {
  flex: 1;
  min-width: 0;
}
.run-detail {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.detail-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.detail-label {
  font-size: 13px;
  color: var(--n-text-color-3);
  min-width: 80px;
}
.form-label {
  display: block;
  font-size: 13px;
  margin-bottom: 4px;
}
.form-value {
  font-weight: 500;
}
</style>
