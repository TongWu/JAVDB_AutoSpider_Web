<script setup lang="ts">
import { computed, h, onMounted, ref, watch } from 'vue'
import {
  NAlert, NButton, NGrid, NGi, NCard, NStatistic, NDataTable, NSelect, NSpin,
  type DataTableColumns,
} from 'naive-ui'
import { useI18n } from 'vue-i18n'
import StatusControl from '@/components/StatusControl.vue'
import { listWatchIntents, type WatchIntent, type WatchStatus } from '@/api/watchlist'
import { isNetworkError } from '@/api/client'

const { t } = useI18n()

const items = ref<WatchIntent[]>([])
const total = ref(0)
const loading = ref(false)
const error = ref<string | null>(null)
const statusFilter = ref<WatchStatus | null>(null)
// Monotonic token: when list requests overlap (rapid filter changes or an
// update-triggered reload), only the newest response may write state — mirrors
// ConsumptionView's recentSeq guard.
let listSeq = 0

const statusOptions = computed(() => [
  { label: t('library.watchlist.status.want'), value: 'want' },
  { label: t('library.watchlist.status.viewed'), value: 'viewed' },
])

// Surface a distinct localized message for connectivity/timeout failures (which
// carry no HTTP status) instead of the generic load error.
function loadErrorMessage(err: unknown): string {
  return isNetworkError(err) ? t('common.networkError') : t('library.watchlist.loadError')
}

async function fetchList(): Promise<void> {
  const seq = ++listSeq
  loading.value = true
  error.value = null
  try {
    // The "Tracked" KPI is the grand total of ALL intents, independent of the
    // status filter (mirrors ConsumptionView's stable summary). A cheap
    // unfiltered head request reads that count; the table below stays filtered.
    const grand = await listWatchIntents({ status: null, limit: 1, offset: 0 }, { skipErrorToast: true })
    if (seq !== listSeq) return
    // Page through the filtered set so the table never silently omits rows
    // beyond the first page; the NDataTable paginates the result client-side.
    const PAGE = 200
    const all: WatchIntent[] = []
    for (let offset = 0; ; offset += PAGE) {
      const res = await listWatchIntents(
        { status: statusFilter.value, limit: PAGE, offset },
        { skipErrorToast: true },
      )
      if (seq !== listSeq) return
      all.push(...res.items)
      if (res.items.length < PAGE) break
    }
    items.value = all
    total.value = grand.total
  } catch (err) {
    if (seq !== listSeq) return
    error.value = loadErrorMessage(err)
  } finally {
    if (seq === listSeq) loading.value = false
  }
}

// Reconcile one row in place after StatusControl performs its own write, rather
// than a full reload: avoids a whole-table loading mask, keeps the user on their
// current table page, and never raises a load-error banner for a write that
// already succeeded. Untrack (null) removes the row and decrements the grand
// total; a re-status keeps the grand total but drops the row when it no longer
// matches an active status filter.
function applyLocalChange(videoCode: string, val: WatchStatus | null): void {
  // Invalidate any list fetch already in flight: a GET that observed the
  // pre-write state must not commit on top of this optimistic reconciliation,
  // which would resurrect a removed row or restore the stale grand total.
  listSeq += 1
  const idx = items.value.findIndex((r) => r.video_code === videoCode)
  if (val === null) {
    if (idx !== -1) items.value = items.value.filter((_, i) => i !== idx)
    total.value = Math.max(0, total.value - 1)
    return
  }
  if (idx === -1) return
  if (statusFilter.value !== null && val !== statusFilter.value) {
    items.value = items.value.filter((_, i) => i !== idx)
  } else {
    items.value = items.value.map((r, i) => (i === idx ? { ...r, status: val } : r))
  }
}

const columns = computed<DataTableColumns<WatchIntent>>(() => [
  {
    title: t('library.watchlist.col.videoCode'),
    key: 'video_code',
    render: (row) =>
      h(
        'span',
        { style: 'font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px;' },
        row.video_code,
      ),
  },
  {
    title: t('library.watchlist.col.status'),
    key: 'status',
    width: 140,
    render: (row) =>
      h(StatusControl, {
        videoCode: row.video_code,
        href: row.href,
        initialStatus: row.status,
        onChange: (val: WatchStatus | null) => applyLocalChange(row.video_code, val),
      }),
  },
  {
    title: t('library.watchlist.col.updatedAt'),
    key: 'updated_at',
    render: (row) => (row.updated_at ? row.updated_at.slice(0, 19).replace('T', ' ') : '—'),
  },
])

watch(statusFilter, () => void fetchList())
onMounted(() => void fetchList())
</script>

<template>
  <NSpin :show="loading">
    <NAlert
      v-if="error"
      type="error"
      class="load-error"
    >
      {{ error }}
      <NButton
        size="small"
        style="margin-left: 12px"
        @click="fetchList"
      >
        {{ t('common.retry') }}
      </NButton>
    </NAlert>

    <NGrid
      :cols="2"
      :x-gap="12"
      :y-gap="12"
      responsive="screen"
      :item-responsive="true"
    >
      <NGi span="2 s:2 m:1">
        <NCard size="small">
          <NStatistic
            :label="t('library.watchlist.total')"
            :value="total"
          />
        </NCard>
      </NGi>
    </NGrid>

    <NCard
      size="small"
      :title="t('library.watchlist.recent')"
      class="block"
    >
      <div class="filter-row">
        <NSelect
          v-model:value="statusFilter"
          :options="statusOptions"
          :placeholder="t('library.watchlist.allStatuses')"
          clearable
          class="filter-select"
        />
      </div>
      <NDataTable
        :columns="columns"
        :data="items"
        :bordered="false"
        size="small"
        :row-key="(row: WatchIntent) => row.video_code"
        :pagination="{ pageSize: 50 }"
      />
    </NCard>
  </NSpin>
</template>

<style scoped>
.load-error {
  margin-bottom: 12px;
}
.block {
  margin-top: 12px;
}
.filter-row {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}
.filter-select {
  width: 200px;
}
</style>
