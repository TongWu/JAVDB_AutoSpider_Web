<script setup lang="ts">
import { computed, h, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NCard,
  NAlert,
  NButton,
  NCollapse,
  NCollapseItem,
  NDataTable,
  NSpace,
  NSwitch,
  NTag,
  type DataTableColumns,
} from 'naive-ui'
import {
  getRcloneLast,
  runRclone,
  type RcloneLastResponse,
  type RcloneRunResponse,
} from '@/api/operations'

const { t } = useI18n()

// ── Last scan state ─────────────────────────────────────────────────
const lastScan = ref<RcloneLastResponse | null>(null)
const lastScanLoading = ref(false)
const lastScanError = ref<string | null>(null)

async function fetchLastScan() {
  lastScanLoading.value = true
  lastScanError.value = null
  try {
    lastScan.value = await getRcloneLast()
  } catch (e) {
    lastScanError.value = e instanceof Error ? e.message : String(e)
  } finally {
    lastScanLoading.value = false
  }
}

// ── Run dedup state ─────────────────────────────────────────────────
const scan = ref(true)
const report = ref(true)
const execute = ref(true)
const dedupDryRun = ref(true)
const dedupLoading = ref(false)
const dedupError = ref<string | null>(null)
const dedupResult = ref<RcloneRunResponse | null>(null)

// Disable execute when report is off
watch(report, (val) => {
  if (!val) execute.value = false
})

async function runQuickDedup() {
  dedupLoading.value = true
  dedupError.value = null
  dedupResult.value = null
  try {
    dedupResult.value = await runRclone({
      scan: true,
      report: true,
      execute: true,
      dry_run: true,
    })
  } catch (e) {
    dedupError.value = e instanceof Error ? e.message : String(e)
  } finally {
    dedupLoading.value = false
  }
}

async function runAdvancedDedup() {
  dedupLoading.value = true
  dedupError.value = null
  dedupResult.value = null
  try {
    dedupResult.value = await runRclone({
      scan: scan.value,
      report: report.value,
      execute: execute.value,
      dry_run: dedupDryRun.value,
    })
  } catch (e) {
    dedupError.value = e instanceof Error ? e.message : String(e)
  } finally {
    dedupLoading.value = false
  }
}

onMounted(() => fetchLastScan())

// ── Helpers ─────────────────────────────────────────────────────────
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const val = bytes / Math.pow(1024, i)
  return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

// ── Phase result columns ────────────────────────────────────────────
const phaseColumns = computed<DataTableColumns<Record<string, unknown>>>(() => [
  {
    title: t('ops.rclone.col.phase'),
    key: 'phase',
    width: 120,
    render: (row) => String(row.phase ?? row.key ?? '—'),
  },
  {
    title: t('ops.rclone.col.status'),
    key: 'status',
    width: 100,
    render: (row) => {
      const s = String(row.status ?? row.result ?? '—')
      const tp = s === 'ok' || s === 'success' ? 'success' : s === 'skipped' ? 'warning' : s === 'error' || s === 'failed' ? 'error' : 'default'
      return h(NTag, { size: 'small', round: true, type: tp }, () => s)
    },
  },
  {
    title: t('ops.rclone.col.detail'),
    key: 'detail',
    ellipsis: { tooltip: true },
    minWidth: 200,
    render: (row) => {
      const { phase: _p, key: _k, status: _s, result: _r, ...rest } = row
      const keys = Object.keys(rest)
      return keys.length > 0 ? JSON.stringify(rest) : '—'
    },
  },
])

// Convert phase_results object to array for table display
function phaseResultsToArray(phaseResults: Record<string, unknown>): Record<string, unknown>[] {
  return Object.entries(phaseResults).map(([key, value]) => {
    if (typeof value === 'object' && value !== null) {
      return { phase: key, ...(value as Record<string, unknown>) }
    }
    return { phase: key, result: String(value) }
  })
}
</script>

<template>
  <div class="rclone-page">
    <header class="page-header">
      <div class="page-header-left">
        <h1>{{ t('nav.rclone') }}</h1>
        <p class="subtitle">
          {{ t('ops.rclone.subtitle') }}
        </p>
      </div>
    </header>

    <!-- Last Scan Summary -->
    <NCard :title="t('ops.rclone.lastScan')">
      <template #header-extra>
        <NButton
          size="small"
          :loading="lastScanLoading"
          @click="fetchLastScan"
        >
          {{ t('common.retry') }}
        </NButton>
      </template>

      <NAlert
        v-if="lastScanError"
        type="error"
        :title="t('errors.generic.title')"
        closable
        style="margin-bottom: 12px"
        @close="lastScanError = null"
      >
        {{ lastScanError }}
      </NAlert>

      <div
        v-if="lastScan"
        class="summary-grid"
      >
        <NSpace :size="24">
          <div class="stat-block">
            <span class="stat-label">{{ t('ops.rclone.inventoryCount') }}</span>
            <span class="stat-value">{{ lastScan.inventory_count }}</span>
          </div>
          <div class="stat-block">
            <span class="stat-label">{{ t('ops.rclone.lastScanTime') }}</span>
            <span class="stat-value stat-value-sm">{{ lastScan.last_scan_time || '—' }}</span>
          </div>
          <div class="stat-block">
            <span class="stat-label">{{ t('ops.rclone.dedupPending') }}</span>
            <span class="stat-value">{{ lastScan.dedup_pending }}</span>
          </div>
          <div class="stat-block">
            <span class="stat-label">{{ t('ops.rclone.dedupCompleted') }}</span>
            <span class="stat-value">{{ lastScan.dedup_completed }}</span>
          </div>
          <div class="stat-block">
            <span class="stat-label">{{ t('ops.rclone.totalFreed') }}</span>
            <span class="stat-value">{{ formatBytes(lastScan.total_freed_bytes) }}</span>
          </div>
        </NSpace>
      </div>
    </NCard>

    <!-- Run Dedup -->
    <NCard :title="t('ops.rclone.runDedup')">
      <NSpace
        vertical
        :size="12"
      >
        <NButton
          type="primary"
          size="small"
          :loading="dedupLoading"
          @click="runQuickDedup"
        >
          {{ t('ops.rclone.quickDedup') }}
        </NButton>

        <NCollapse>
          <NCollapseItem :title="t('ops.rclone.advanced')">
            <NSpace
              align="center"
              :wrap="true"
              :size="16"
            >
              <NSpace
                align="center"
                :size="6"
              >
                <span class="form-label">{{ t('ops.rclone.scan') }}</span>
                <NSwitch v-model:value="scan" />
              </NSpace>
              <NSpace
                align="center"
                :size="6"
              >
                <span class="form-label">{{ t('ops.rclone.report') }}</span>
                <NSwitch v-model:value="report" />
              </NSpace>
              <NSpace
                align="center"
                :size="6"
              >
                <span class="form-label">{{ t('ops.rclone.execute') }}</span>
                <NSwitch
                  v-model:value="execute"
                  :disabled="!report"
                />
              </NSpace>
              <NSpace
                align="center"
                :size="6"
              >
                <span class="form-label">{{ t('ops.rclone.dryRun') }}</span>
                <NSwitch v-model:value="dedupDryRun" />
              </NSpace>
              <NButton
                type="primary"
                size="small"
                :loading="dedupLoading"
                @click="runAdvancedDedup"
              >
                {{ t('ops.rclone.runDedup') }}
              </NButton>
            </NSpace>
          </NCollapseItem>
        </NCollapse>
      </NSpace>

      <NAlert
        v-if="dedupError"
        type="error"
        :title="t('errors.generic.title')"
        closable
        style="margin-top: 12px"
        @close="dedupError = null"
      >
        {{ dedupError }}
      </NAlert>

      <div
        v-if="dedupResult"
        class="dedup-result"
      >
        <NSpace :size="24">
          <div class="stat-block">
            <span class="stat-label">{{ t('ops.rclone.dryRun') }}</span>
            <NTag
              size="small"
              :type="dedupResult.dry_run ? 'warning' : 'success'"
            >
              {{ dedupResult.dry_run ? t('common.yes') : t('common.no') }}
            </NTag>
          </div>
        </NSpace>

        <NDataTable
          v-if="Object.keys(dedupResult.phase_results).length > 0"
          :columns="phaseColumns"
          :data="phaseResultsToArray(dedupResult.phase_results)"
          :row-key="(_row: Record<string, unknown>, idx: number) => idx"
          striped
          style="margin-top: 12px"
          :max-height="300"
        />
      </div>
    </NCard>
  </div>
</template>

<style scoped>
.rclone-page {
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
.summary-grid {
  margin-top: 4px;
}
.dedup-result {
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
.stat-value-sm {
  font-size: 14px;
}
</style>
