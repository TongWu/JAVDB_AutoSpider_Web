<!-- src/pages/library/ConsumptionView.vue -->
<script setup lang="ts">
import { computed, h, onMounted, ref, watch } from 'vue'
import {
  NAlert, NButton, NGrid, NGi, NCard, NStatistic, NDataTable, NSelect, NTag, NSpin, NEmpty,
  NCollapse, NCollapseItem,
  type DataTableColumns, type SelectOption,
} from 'naive-ui'
import { Bar } from 'vue-chartjs'
import {
  Chart as ChartJS, Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale,
} from 'chart.js'
import { useI18n } from 'vue-i18n'
import {
  getConsumptionSummary, getConsumptionRecent, getConsumptionTrend, getConsumptionUnresolved,
  type ConsumptionSummary, type ConsumptionRecentItem, type ConsumptionTrendPoint, type UnresolvedItem,
} from '@/api/library_consumption'

ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale)

const { t } = useI18n()

const summary = ref<ConsumptionSummary | null>(null)
const recent = ref<ConsumptionRecentItem[]>([])
const trend = ref<ConsumptionTrendPoint[]>([])
const unresolved = ref<UnresolvedItem[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const instanceFilter = ref<string | null>(null)
// NSelect requires string/number values; use "true"/"false" strings then convert to bool when calling API
const watchedFilterStr = ref<string | null>(null)
// Monotonic token for recent — newest filter wins on concurrent requests
let recentSeq = 0

const watchedOptions = computed<SelectOption[]>(() => [
  { label: t('library.consumption.watchedTrue'), value: 'true' },
  { label: t('library.consumption.watchedFalse'), value: 'false' },
])

// Instance options derived from the fetched data (recent + unresolved rows),
// since there is no dedicated instances endpoint. Distinct, sorted, self-labeled.
const instanceOptions = computed<SelectOption[]>(() => {
  const seen = new Set<string>()
  for (const r of recent.value) if (r.instance) seen.add(r.instance)
  for (const u of unresolved.value) if (u.instance) seen.add(u.instance)
  return [...seen].sort().map((value) => ({ label: value, value }))
})

function watchedBool(): boolean | null {
  if (watchedFilterStr.value === 'true') return true
  if (watchedFilterStr.value === 'false') return false
  return null
}

const trendChartData = computed(() => ({
  labels: trend.value.map((p) => p.date),
  datasets: [
    {
      label: t('library.consumption.watched'),
      data: trend.value.map((p) => p.watched),
      backgroundColor: '#18a058',
    },
    {
      // Stacked remainder: watched + unwatched = total_signals.
      label: t('library.consumption.unwatched'),
      data: trend.value.map((p) => p.total_signals - p.watched),
      backgroundColor: '#909399',
    },
  ],
}))
const trendChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } },
}

function watchedTag(watched: boolean | null) {
  if (watched === true)
    return h(NTag, { size: 'small', round: true, type: 'success' }, () => t('library.consumption.watchedTrue'))
  if (watched === false)
    return h(NTag, { size: 'small', round: true, type: 'warning' }, () => t('library.consumption.watchedFalse'))
  return '—'
}

const recentColumns = computed<DataTableColumns<ConsumptionRecentItem>>(() => [
  {
    title: t('library.consumption.col.videoCode'),
    key: 'video_code',
    render: (row) => h('span', { style: { fontFamily: 'monospace' } }, row.video_code),
  },
  {
    title: t('library.consumption.col.instance'),
    key: 'instance',
    render: (row) => row.instance,
  },
  {
    title: t('library.consumption.col.watched'),
    key: 'watched',
    render: (row) => watchedTag(row.watched ?? null),
  },
  {
    title: t('library.consumption.col.rating'),
    key: 'rating',
    render: (row) => (row.rating != null ? String(row.rating) : t('library.consumption.ratingNone')),
  },
  {
    title: t('library.consumption.col.watchedAt'),
    key: 'watched_at',
    render: (row) => row.watched_at ?? '—',
  },
  {
    title: t('library.consumption.col.observedAt'),
    key: 'observed_at',
    render: (row) => row.observed_at ?? '—',
  },
])

const unresolvedColumns = computed<DataTableColumns<UnresolvedItem>>(() => [
  {
    title: t('library.consumption.unresolvedCol.instance'),
    key: 'instance',
    render: (row) => row.instance,
  },
  {
    title: t('library.consumption.unresolvedCol.rawTitle'),
    key: 'raw_title',
    render: (row) => row.raw_title ?? '—',
  },
  {
    title: t('library.consumption.unresolvedCol.filePath'),
    key: 'file_path',
    render: (row) => h('span', { style: { fontFamily: 'monospace', fontSize: '12px' } }, row.file_path ?? '—'),
  },
  {
    title: t('library.consumption.unresolvedCol.observedAt'),
    key: 'observed_at',
    render: (row) => row.observed_at ?? '—',
  },
])

async function fetchRecent() {
  const seq = ++recentSeq
  error.value = null
  try {
    const rows = await getConsumptionRecent({
      instance: instanceFilter.value,
      watched: watchedBool(),
      limit: 50,
    })
    if (seq === recentSeq) recent.value = rows
  } catch (err) {
    if (seq === recentSeq)
      error.value = err instanceof Error ? err.message : t('library.consumption.loadError')
  }
}

async function fetchAll() {
  const seq = ++recentSeq
  loading.value = true
  error.value = null
  try {
    const [s, r, tr, u] = await Promise.all([
      getConsumptionSummary(),
      getConsumptionRecent({ instance: instanceFilter.value, watched: watchedBool(), limit: 50 }),
      getConsumptionTrend('30d'),
      getConsumptionUnresolved({ limit: 50 }),
    ])
    summary.value = s
    if (seq === recentSeq) recent.value = r
    trend.value = tr
    unresolved.value = u
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('library.consumption.loadError')
  } finally {
    loading.value = false
  }
}

watch([instanceFilter, watchedFilterStr], () => void fetchRecent())
onMounted(() => void fetchAll())
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
        @click="fetchAll"
      >
        {{ t('common.retry') }}
      </NButton>
    </NAlert>

    <!-- KPI cards: total, watched, unwatched, unresolved -->
    <NGrid
      :cols="4"
      :x-gap="12"
      :y-gap="12"
      responsive="screen"
      :item-responsive="true"
    >
      <NGi span="4 s:4 m:1">
        <NCard size="small">
          <NStatistic
            :label="t('library.consumption.totalSignals')"
            :value="summary?.total_signals ?? 0"
          />
        </NCard>
      </NGi>
      <NGi span="4 s:4 m:1">
        <NCard size="small">
          <NStatistic
            :label="t('library.consumption.watched')"
            :value="summary?.watched_count ?? 0"
          />
        </NCard>
      </NGi>
      <NGi span="4 s:4 m:1">
        <NCard size="small">
          <NStatistic
            :label="t('library.consumption.unwatched')"
            :value="summary?.unwatched_count ?? 0"
          />
        </NCard>
      </NGi>
      <NGi span="4 s:4 m:1">
        <NCard size="small">
          <NStatistic
            :label="t('library.consumption.unresolved')"
            :value="summary?.unresolved_count ?? 0"
          />
        </NCard>
      </NGi>
    </NGrid>

    <!-- avg_rating inline badge -->
    <div
      v-if="summary"
      class="avg-rating"
    >
      {{ t('library.consumption.avgRating') }}:
      <strong>{{ summary.avg_rating != null ? summary.avg_rating.toFixed(1) : t('library.consumption.ratingNone') }}</strong>
    </div>

    <!-- Watch trend chart -->
    <NCard
      size="small"
      :title="t('library.consumption.trend')"
      class="block"
    >
      <div class="chart-wrap">
        <Bar
          v-if="trend.length"
          :data="trendChartData"
          :options="trendChartOptions"
        />
        <NEmpty
          v-else
          :description="t('library.comingSoon')"
        />
      </div>
    </NCard>

    <!-- Recent signals table -->
    <NCard
      size="small"
      :title="t('library.consumption.recent')"
      class="block"
    >
      <div class="filter-row">
        <NSelect
          v-model:value="instanceFilter"
          :options="instanceOptions"
          :placeholder="t('library.consumption.allInstances')"
          clearable
          class="filter-select"
        />
        <NSelect
          v-model:value="watchedFilterStr"
          :options="watchedOptions"
          :placeholder="t('library.consumption.allWatched')"
          clearable
          class="filter-select"
        />
      </div>
      <NDataTable
        :columns="recentColumns"
        :data="recent"
        :bordered="false"
        size="small"
        :row-key="(row: ConsumptionRecentItem) =>
          `${row.video_code}::${row.source_type}::${row.instance}::${row.library_id}`"
      />
    </NCard>

    <!-- Unresolved items (secondary, collapsible) -->
    <NCard
      size="small"
      class="block"
    >
      <NCollapse>
        <NCollapseItem
          :title="`${t('library.consumption.unresolvedSection')} (${unresolved.length})`"
          name="unresolved"
        >
          <NDataTable
            :columns="unresolvedColumns"
            :data="unresolved"
            :bordered="false"
            size="small"
            :row-key="(row: UnresolvedItem) => `${row.instance}::${row.library_id}::${row.item_id}`"
          />
        </NCollapseItem>
      </NCollapse>
    </NCard>
  </NSpin>
</template>

<style scoped>
.load-error {
  margin-bottom: 16px;
}
.block {
  margin-top: 16px;
}
.avg-rating {
  margin-top: 12px;
  font-size: 13px;
  color: var(--n-text-color-3, #888);
}
.chart-wrap {
  height: 260px;
}
.filter-row {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
}
.filter-select {
  max-width: 220px;
}
</style>
