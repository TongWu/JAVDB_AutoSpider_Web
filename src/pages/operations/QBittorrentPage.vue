<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NCard,
  NAlert,
  NDataTable,
  NButton,
  NInputNumber,
  NProgress,
  NSpace,
  NSwitch,
  NTag,
  type DataTableColumns,
} from 'naive-ui'
import {
  getQbTorrents,
  filterSmallFiles,
  type QbTorrentItem,
  type QbFilterSmallResponse,
} from '@/api/operations'

const { t } = useI18n()

// ── Torrents state ───────────────────────────────────────────────────
const torrents = ref<QbTorrentItem[]>([])
const torrentsLoading = ref(false)
const torrentsError = ref<string | null>(null)
const torrentsTotal = ref(0)

async function fetchTorrents() {
  torrentsLoading.value = true
  torrentsError.value = null
  try {
    const res = await getQbTorrents()
    torrents.value = res.items
    torrentsTotal.value = res.total
  } catch (e) {
    torrentsError.value = e instanceof Error ? e.message : String(e)
  } finally {
    torrentsLoading.value = false
  }
}

// ── Filter state ─────────────────────────────────────────────────────
const minSizeMb = ref(100)
const filterDays = ref(2)
const dryRun = ref(true)
const filterLoading = ref(false)
const filterError = ref<string | null>(null)
const filterResult = ref<QbFilterSmallResponse | null>(null)

async function runFilter() {
  filterLoading.value = true
  filterError.value = null
  filterResult.value = null
  try {
    filterResult.value = await filterSmallFiles({
      min_size_mb: minSizeMb.value,
      days: filterDays.value,
      dry_run: dryRun.value,
    })
  } catch (e) {
    filterError.value = e instanceof Error ? e.message : String(e)
  } finally {
    filterLoading.value = false
  }
}

onMounted(() => fetchTorrents())

// ── Helpers ──────────────────────────────────────────────────────────
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const val = bytes / Math.pow(1024, i)
  return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function formatTimestamp(ts: number): string {
  if (!ts || ts <= 0) return '—'
  return new Date(ts * 1000).toLocaleString()
}

function stateType(state: string): 'success' | 'info' | 'warning' | 'error' | 'default' {
  if (state === 'uploading' || state === 'stalledUP' || state === 'forcedUP') return 'success'
  if (state === 'downloading' || state === 'stalledDL' || state === 'forcedDL') return 'info'
  if (state === 'pausedDL' || state === 'pausedUP') return 'warning'
  if (state === 'error' || state === 'missingFiles') return 'error'
  return 'default'
}

// ── Torrent table columns ────────────────────────────────────────────
const torrentColumns = computed<DataTableColumns<QbTorrentItem>>(() => [
  {
    title: t('ops.qb.col.name'),
    key: 'name',
    ellipsis: { tooltip: true },
    minWidth: 200,
  },
  {
    title: t('ops.qb.col.size'),
    key: 'size',
    width: 100,
    render: (row) => formatBytes(row.size),
  },
  {
    title: t('ops.qb.col.progress'),
    key: 'progress',
    width: 140,
    render: (row) =>
      h(NProgress, {
        type: 'line',
        percentage: Math.round(row.progress * 100),
        indicatorPlacement: 'inside',
        status: row.progress >= 1 ? 'success' : undefined,
      }),
  },
  {
    title: t('ops.qb.col.state'),
    key: 'state',
    width: 120,
    render: (row) =>
      h(NTag, { size: 'small', round: true, type: stateType(row.state) }, () => row.state),
  },
  {
    title: t('ops.qb.col.category'),
    key: 'category',
    width: 120,
    render: (row) => row.category || '—',
  },
  {
    title: t('ops.qb.col.addedOn'),
    key: 'added_on',
    width: 170,
    render: (row) => formatTimestamp(row.added_on),
  },
])

// ── Filter detail columns ────────────────────────────────────────────
const filterDetailColumns = computed<DataTableColumns<Record<string, unknown>>>(() => [
  {
    title: t('ops.qb.col.name'),
    key: 'name',
    ellipsis: { tooltip: true },
    minWidth: 200,
    render: (row) => String(row.name ?? row.torrent_name ?? '—'),
  },
  {
    title: t('ops.qb.col.size'),
    key: 'size',
    width: 100,
    render: (row) => {
      const s = row.size ?? row.total_size
      return typeof s === 'number' ? formatBytes(s) : String(s ?? '—')
    },
  },
  {
    title: t('ops.qb.col.state'),
    key: 'action',
    width: 120,
    render: (row) => String(row.action ?? row.status ?? '—'),
  },
])
</script>

<template>
  <div class="qb-page">
    <header class="page-header">
      <div class="page-header-left">
        <h1>{{ t('nav.qbittorrent') }}</h1>
        <p class="subtitle">
          {{ t('ops.qb.subtitle') }}
        </p>
      </div>
    </header>

    <!-- Current Torrents -->
    <NCard :title="t('ops.qb.currentTorrents')">
      <template #header-extra>
        <NSpace :size="8">
          <span class="torrent-count">{{ t('ops.qb.total', { count: torrentsTotal }) }}</span>
          <NButton
            size="small"
            :loading="torrentsLoading"
            @click="fetchTorrents"
          >
            {{ t('common.retry') }}
          </NButton>
        </NSpace>
      </template>

      <NAlert
        v-if="torrentsError"
        type="error"
        :title="t('errors.generic.title')"
        closable
        style="margin-bottom: 12px"
        @close="torrentsError = null"
      >
        {{ torrentsError }}
      </NAlert>

      <NDataTable
        :columns="torrentColumns"
        :data="torrents"
        :loading="torrentsLoading"
        :row-key="(row: QbTorrentItem) => row.hash"
        striped
        :max-height="420"
      />
    </NCard>

    <!-- Filter Small Files -->
    <NCard :title="t('ops.qb.filterSmall')">
      <NSpace
        align="center"
        :wrap="true"
        :size="16"
      >
        <NSpace
          align="center"
          :size="6"
        >
          <span class="form-label">{{ t('ops.qb.minSizeMb') }}</span>
          <NInputNumber
            v-model:value="minSizeMb"
            :min="1"
            :max="10000"
            size="small"
            style="width: 120px"
          />
        </NSpace>
        <NSpace
          align="center"
          :size="6"
        >
          <span class="form-label">{{ t('ops.qb.days') }}</span>
          <NInputNumber
            v-model:value="filterDays"
            :min="1"
            :max="365"
            size="small"
            style="width: 100px"
          />
        </NSpace>
        <NSpace
          align="center"
          :size="6"
        >
          <span class="form-label">{{ t('ops.qb.dryRun') }}</span>
          <NSwitch v-model:value="dryRun" />
        </NSpace>
        <NButton
          type="primary"
          size="small"
          :loading="filterLoading"
          @click="runFilter"
        >
          {{ t('ops.qb.runFilter') }}
        </NButton>
      </NSpace>

      <NAlert
        v-if="filterError"
        type="error"
        :title="t('errors.generic.title')"
        closable
        style="margin-top: 12px"
        @close="filterError = null"
      >
        {{ filterError }}
      </NAlert>

      <div
        v-if="filterResult"
        class="filter-result"
      >
        <NSpace :size="24">
          <div class="stat-block">
            <span class="stat-label">{{ t('ops.qb.filteredCount') }}</span>
            <span class="stat-value">{{ filterResult.filtered_count }}</span>
          </div>
          <div class="stat-block">
            <span class="stat-label">{{ t('ops.qb.torrentsScanned') }}</span>
            <span class="stat-value">{{ filterResult.torrents_scanned }}</span>
          </div>
          <div class="stat-block">
            <span class="stat-label">{{ t('ops.qb.dryRun') }}</span>
            <NTag
              size="small"
              :type="filterResult.dry_run ? 'warning' : 'success'"
            >
              {{ filterResult.dry_run ? t('common.yes') : t('common.no') }}
            </NTag>
          </div>
        </NSpace>

        <NDataTable
          v-if="filterResult.details.length > 0"
          :columns="filterDetailColumns"
          :data="filterResult.details"
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
.qb-page {
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
.torrent-count {
  font-size: 13px;
  color: var(--n-text-color-3);
}
.form-label {
  font-size: 13px;
  white-space: nowrap;
}
.filter-result {
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
</style>
