<script setup lang="ts">
import { computed, h, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NCard,
  NAlert,
  NDataTable,
  NButton,
  NInputNumber,
  NSelect,
  NSpace,
  NSwitch,
  NTag,
  type DataTableColumns,
  type SelectOption,
} from 'naive-ui'
import {
  cleanupStaleSessions,
  cleanupClaimStages,
  type CleanupStaleResponse,
  type CleanupClaimStagesResponse,
} from '@/api/operations'

const { t } = useI18n()

// ── Stale session cleanup state ─────────────────────────────────────
const staleOlderThanHours = ref(48)
const staleScope = ref<'all' | 'reports' | 'operations' | 'history'>('all')
const staleIncludeLegacy = ref(false)
const staleDryRun = ref(true)
const staleLoading = ref(false)
const staleError = ref<string | null>(null)
const staleResult = ref<CleanupStaleResponse | null>(null)

const scopeOptions = computed<SelectOption[]>(() => [
  { label: t('ops.cleanup.scopeAll'), value: 'all' },
  { label: t('ops.cleanup.scopeReports'), value: 'reports' },
  { label: t('ops.cleanup.scopeOperations'), value: 'operations' },
  { label: t('ops.cleanup.scopeHistory'), value: 'history' },
])

async function runStaleCleanup() {
  staleLoading.value = true
  staleError.value = null
  staleResult.value = null
  try {
    staleResult.value = await cleanupStaleSessions({
      older_than_hours: staleOlderThanHours.value,
      scope: staleScope.value,
      include_legacy: staleIncludeLegacy.value,
      dry_run: staleDryRun.value,
    })
  } catch (e) {
    staleError.value = e instanceof Error ? e.message : String(e)
  } finally {
    staleLoading.value = false
  }
}

// ── Claim stage sweep state ─────────────────────────────────────────
const claimShardDates = ref<string[]>([])
const claimOlderThanHours = ref(6)
const claimLoading = ref(false)
const claimError = ref<string | null>(null)
const claimResult = ref<CleanupClaimStagesResponse | null>(null)
const newShardDate = ref('')

function addShardDate() {
  const val = newShardDate.value.trim()
  if (val && !claimShardDates.value.includes(val)) {
    claimShardDates.value.push(val)
  }
  newShardDate.value = ''
}

function removeShardDate(idx: number) {
  claimShardDates.value.splice(idx, 1)
}

async function runClaimSweep() {
  claimLoading.value = true
  claimError.value = null
  claimResult.value = null
  try {
    claimResult.value = await cleanupClaimStages({
      shard_dates: claimShardDates.value.length > 0 ? claimShardDates.value : undefined,
      older_than_hours: claimOlderThanHours.value,
    })
  } catch (e) {
    claimError.value = e instanceof Error ? e.message : String(e)
  } finally {
    claimLoading.value = false
  }
}

// ── Stale detail columns ────────────────────────────────────────────
const staleDetailColumns = computed<DataTableColumns<Record<string, unknown>>>(() => [
  {
    title: t('ops.cleanup.col.sessionId'),
    key: 'session_id',
    ellipsis: { tooltip: true },
    minWidth: 200,
    render: (row) => String(row.session_id ?? '—'),
  },
  {
    title: t('ops.cleanup.col.status'),
    key: 'status',
    width: 120,
    render: (row) => {
      const s = String(row.status ?? row.action ?? '—')
      const tp = s === 'cleaned' || s === 'deleted' ? 'success' : s === 'failed' ? 'error' : 'default'
      return h(NTag, { size: 'small', round: true, type: tp }, () => s)
    },
  },
  {
    title: t('ops.cleanup.col.detail'),
    key: 'detail',
    ellipsis: { tooltip: true },
    minWidth: 200,
    render: (row) => {
      const rest = Object.fromEntries(
        Object.entries(row).filter(([k]) => !['session_id', 'status', 'action'].includes(k)),
      )
      return Object.keys(rest).length > 0 ? JSON.stringify(rest) : '—'
    },
  },
])

// ── Claim detail columns ────────────────────────────────────────────
const claimDetailColumns = computed<DataTableColumns<Record<string, unknown>>>(() => [
  {
    title: t('ops.cleanup.col.shard'),
    key: 'shard',
    width: 140,
    render: (row) => String(row.shard ?? row.shard_date ?? '—'),
  },
  {
    title: t('ops.cleanup.col.status'),
    key: 'status',
    width: 120,
    render: (row) => {
      const s = String(row.status ?? row.result ?? '—')
      const tp = s === 'ok' || s === 'success' || s === 'reaped' ? 'success' : s === 'failed' ? 'error' : 'default'
      return h(NTag, { size: 'small', round: true, type: tp }, () => s)
    },
  },
  {
    title: t('ops.cleanup.col.detail'),
    key: 'detail',
    ellipsis: { tooltip: true },
    minWidth: 200,
    render: (row) => {
      const rest = Object.fromEntries(
        Object.entries(row).filter(([k]) => !['shard', 'shard_date', 'status', 'result'].includes(k)),
      )
      return Object.keys(rest).length > 0 ? JSON.stringify(rest) : '—'
    },
  },
])
</script>

<template>
  <div class="cleanup-page">
    <header class="page-header">
      <div class="page-header-left">
        <h1>{{ t('nav.cleanup') }}</h1>
        <p class="subtitle">
          {{ t('ops.cleanup.subtitle') }}
        </p>
      </div>
    </header>

    <!-- Stale Session Cleanup -->
    <NCard :title="t('ops.cleanup.staleSessions')">
      <NSpace
        align="center"
        :wrap="true"
        :size="16"
      >
        <NSpace
          align="center"
          :size="6"
        >
          <span class="form-label">{{ t('ops.cleanup.olderThanHours') }}</span>
          <NInputNumber
            v-model:value="staleOlderThanHours"
            :min="1"
            :max="8760"
            size="small"
            style="width: 100px"
          />
        </NSpace>
        <NSpace
          align="center"
          :size="6"
        >
          <span class="form-label">{{ t('ops.cleanup.scope') }}</span>
          <NSelect
            v-model:value="staleScope"
            :options="scopeOptions"
            size="small"
            style="width: 140px"
          />
        </NSpace>
        <NSpace
          align="center"
          :size="6"
        >
          <span class="form-label">{{ t('ops.cleanup.includeLegacy') }}</span>
          <NSwitch v-model:value="staleIncludeLegacy" />
        </NSpace>
        <NSpace
          align="center"
          :size="6"
        >
          <span class="form-label">{{ t('ops.cleanup.dryRun') }}</span>
          <NSwitch v-model:value="staleDryRun" />
        </NSpace>
        <NButton
          type="primary"
          size="small"
          :loading="staleLoading"
          @click="runStaleCleanup"
        >
          {{ t('ops.cleanup.runCleanup') }}
        </NButton>
      </NSpace>

      <NAlert
        v-if="staleError"
        type="error"
        :title="t('errors.generic.title')"
        closable
        style="margin-top: 12px"
        @close="staleError = null"
      >
        {{ staleError }}
      </NAlert>

      <div
        v-if="staleResult"
        class="cleanup-result"
      >
        <NSpace :size="24">
          <div class="stat-block">
            <span class="stat-label">{{ t('ops.cleanup.sessionsFound') }}</span>
            <span class="stat-value">{{ staleResult.sessions_found }}</span>
          </div>
          <div class="stat-block">
            <span class="stat-label">{{ t('ops.cleanup.sessionsCleaned') }}</span>
            <span class="stat-value">{{ staleResult.sessions_cleaned }}</span>
          </div>
          <div class="stat-block">
            <span class="stat-label">{{ t('ops.cleanup.sessionsFailed') }}</span>
            <span class="stat-value">{{ staleResult.sessions_failed }}</span>
          </div>
          <div class="stat-block">
            <span class="stat-label">{{ t('ops.cleanup.dryRun') }}</span>
            <NTag
              size="small"
              :type="staleResult.dry_run ? 'warning' : 'success'"
            >
              {{ staleResult.dry_run ? t('common.yes') : t('common.no') }}
            </NTag>
          </div>
        </NSpace>

        <NDataTable
          v-if="staleResult.details.length > 0"
          :columns="staleDetailColumns"
          :data="staleResult.details"
          :row-key="(row: Record<string, unknown>) => JSON.stringify(row)"
          striped
          style="margin-top: 12px"
          :max-height="300"
        />
      </div>
    </NCard>

    <!-- Claim Stage Sweep -->
    <NCard :title="t('ops.cleanup.claimSweep')">
      <NSpace
        vertical
        :size="12"
      >
        <NSpace
          align="center"
          :wrap="true"
          :size="16"
        >
          <NSpace
            align="center"
            :size="6"
          >
            <span class="form-label">{{ t('ops.cleanup.olderThanHours') }}</span>
            <NInputNumber
              v-model:value="claimOlderThanHours"
              :min="1"
              :max="8760"
              size="small"
              style="width: 100px"
            />
          </NSpace>
          <NButton
            type="primary"
            size="small"
            :loading="claimLoading"
            @click="runClaimSweep"
          >
            {{ t('ops.cleanup.runSweep') }}
          </NButton>
        </NSpace>

        <NSpace
          align="center"
          :wrap="true"
          :size="8"
        >
          <span class="form-label">{{ t('ops.cleanup.shardDates') }}</span>
          <NSpace
            :size="4"
            align="center"
          >
            <NTag
              v-for="(d, idx) in claimShardDates"
              :key="d"
              closable
              size="small"
              @close="removeShardDate(idx)"
            >
              {{ d }}
            </NTag>
          </NSpace>
          <NSpace
            :size="4"
            align="center"
          >
            <input
              v-model="newShardDate"
              type="date"
              class="date-input"
              @keydown.enter="addShardDate"
            >
            <NButton
              size="tiny"
              @click="addShardDate"
            >
              {{ t('ops.cleanup.addDate') }}
            </NButton>
          </NSpace>
        </NSpace>
      </NSpace>

      <NAlert
        v-if="claimError"
        type="error"
        :title="t('errors.generic.title')"
        closable
        style="margin-top: 12px"
        @close="claimError = null"
      >
        {{ claimError }}
      </NAlert>

      <div
        v-if="claimResult"
        class="cleanup-result"
      >
        <NSpace :size="24">
          <div class="stat-block">
            <span class="stat-label">{{ t('ops.cleanup.shardsProcessed') }}</span>
            <span class="stat-value">{{ claimResult.shards_processed }}</span>
          </div>
          <div class="stat-block">
            <span class="stat-label">{{ t('ops.cleanup.stagesReaped') }}</span>
            <span class="stat-value">{{ claimResult.stages_reaped }}</span>
          </div>
        </NSpace>

        <NDataTable
          v-if="claimResult.details.length > 0"
          :columns="claimDetailColumns"
          :data="claimResult.details"
          :row-key="(row: Record<string, unknown>) => JSON.stringify(row)"
          striped
          style="margin-top: 12px"
          :max-height="300"
        />
      </div>
    </NCard>
  </div>
</template>

<style scoped>
.cleanup-page {
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
.form-label {
  font-size: 13px;
  white-space: nowrap;
}
.cleanup-result {
  margin-top: 16px;
}
.stat-block {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.stat-label {
  font-size: 12px;
  color: var(--n-text-color-3);
}
.stat-value {
  font-size: 18px;
  font-weight: 600;
}
.date-input {
  font-size: 13px;
  padding: 2px 8px;
  border: 1px solid var(--n-border-color);
  border-radius: 4px;
  background: transparent;
  color: inherit;
}
</style>
