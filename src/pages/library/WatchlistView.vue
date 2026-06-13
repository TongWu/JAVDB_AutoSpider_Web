<script setup lang="ts">
import { computed, h, onMounted, ref, watch } from 'vue'
import {
  NAlert, NButton, NGrid, NGi, NCard, NStatistic, NDataTable, NSelect, NSpin,
  type DataTableColumns,
} from 'naive-ui'
import { useI18n } from 'vue-i18n'
import StatusControl from '@/components/StatusControl.vue'
import { listWatchIntents, type WatchIntent, type WatchStatus } from '@/api/watchlist'

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

async function fetchList(): Promise<void> {
  const seq = ++listSeq
  loading.value = true
  error.value = null
  try {
    const res = await listWatchIntents({ status: statusFilter.value, limit: 200 })
    if (seq !== listSeq) return
    items.value = res.items
    total.value = res.total
  } catch (err) {
    if (seq !== listSeq) return
    error.value = err instanceof Error ? err.message : t('library.watchlist.loadError')
  } finally {
    if (seq === listSeq) loading.value = false
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
        onChange: () => void fetchList(),
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
