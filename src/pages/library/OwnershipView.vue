<!-- src/pages/library/OwnershipView.vue -->
<script setup lang="ts">
import { computed, h, onMounted, ref, watch } from 'vue'
import {
  NAlert, NButton, NGrid, NGi, NCard, NStatistic, NDataTable, NSelect, NTag, NSpin, NEmpty,
  type DataTableColumns, type SelectOption,
} from 'naive-ui'
import { Bar } from 'vue-chartjs'
import {
  Chart as ChartJS, Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale,
} from 'chart.js'
import { useI18n } from 'vue-i18n'
import {
  getOwnershipSummary, getOwnershipRecent,
  type OwnershipSummary, type OwnershipRecentItem,
} from '@/api/library_ownership'

ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale)

const { t } = useI18n()

const summary = ref<OwnershipSummary | null>(null)
const recent = ref<OwnershipRecentItem[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const sourceFilter = ref<string | null>(null)
// Monotonic token for recent — newest filter wins on concurrent requests
let recentSeq = 0

const SOURCE_KEYS = ['qb', 'nas', 'gdrive', 'pikpak'] as const

const sourceOptions = computed<SelectOption[]>(() =>
  SOURCE_KEYS.map((s) => ({
    label: t(`library.ownership.source.${s}`, s),
    value: s,
  })),
)

// Static per-source bar: unique_titles per source (from summary, not time-series)
const breakdownChartData = computed(() => ({
  labels: (summary.value?.by_source ?? []).map((s) =>
    t(`library.ownership.source.${s.source}`, s.source),
  ),
  datasets: [
    {
      label: t('library.ownership.totalOwned'),
      data: (summary.value?.by_source ?? []).map((s) => s.unique_titles),
      backgroundColor: '#2080f0',
    },
  ],
}))
const breakdownChartOptions = {
  indexAxis: 'y' as const,
  responsive: true,
  maintainAspectRatio: false,
  scales: { x: { beginAtZero: true } },
}

const columns = computed<DataTableColumns<OwnershipRecentItem>>(() => [
  {
    title: t('library.ownership.col.videoCode'),
    key: 'video_code',
    render: (row) => h('span', { style: { fontFamily: 'monospace' } }, row.video_code),
  },
  {
    title: t('library.ownership.col.source'),
    key: 'source',
    render: (row) => t(`library.ownership.source.${row.source}`, row.source),
  },
  { title: t('library.ownership.col.category'), key: 'category', render: (row) => row.category || '—' },
  { title: t('library.ownership.col.path'), key: 'path', render: (row) => row.path ?? '—' },
  {
    title: t('library.ownership.col.present'),
    key: 'present',
    render: (row) =>
      h(
        NTag,
        { size: 'small', round: true, type: row.present === 1 ? 'success' : 'warning' },
        () => (row.present === 1 ? t('library.ownership.present') : t('library.ownership.swept')),
      ),
  },
  { title: t('library.ownership.col.observedAt'), key: 'observed_at', render: (row) => row.observed_at ?? '—' },
])

async function fetchRecent() {
  const seq = ++recentSeq
  error.value = null
  try {
    const rows = await getOwnershipRecent({ source: sourceFilter.value, limit: 50 })
    if (seq === recentSeq) recent.value = rows
  } catch (err) {
    if (seq === recentSeq) error.value = err instanceof Error ? err.message : t('library.ownership.loadError')
  }
}

async function fetchAll() {
  const seq = ++recentSeq
  loading.value = true
  error.value = null
  try {
    const [s, r] = await Promise.all([
      getOwnershipSummary(),
      getOwnershipRecent({ source: sourceFilter.value, limit: 50 }),
    ])
    // Drop stale responses: only the newest in-flight request may assign state.
    if (seq !== recentSeq) return
    summary.value = s
    recent.value = r
  } catch (err) {
    if (seq === recentSeq)
      error.value = err instanceof Error ? err.message : t('library.ownership.loadError')
  } finally {
    if (seq === recentSeq) loading.value = false
  }
}

watch(sourceFilter, () => void fetchRecent())
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

    <!-- KPI: total + per-source cards -->
    <NGrid
      :cols="5"
      :x-gap="12"
      :y-gap="12"
      responsive="screen"
      :item-responsive="true"
    >
      <NGi span="5 s:5 m:1">
        <NCard size="small">
          <NStatistic
            :label="t('library.ownership.totalOwned')"
            :value="summary?.total_owned_titles ?? 0"
          />
        </NCard>
      </NGi>
      <NGi
        v-for="s in SOURCE_KEYS"
        :key="s"
        span="5 s:5 m:1"
      >
        <NCard size="small">
          <NStatistic
            :label="t(`library.ownership.source.${s}`, s)"
            :value="summary?.by_source.find((b) => b.source === s)?.unique_titles ?? 0"
          />
        </NCard>
      </NGi>
    </NGrid>

    <!-- Per-source breakdown bar -->
    <NCard
      size="small"
      :title="t('library.ownership.breakdown')"
      class="block"
    >
      <div class="chart-wrap">
        <Bar
          v-if="summary && summary.by_source.length"
          :data="breakdownChartData"
          :options="breakdownChartOptions"
        />
        <NEmpty
          v-else
          :description="t('library.comingSoon')"
        />
      </div>
    </NCard>

    <!-- Recent table -->
    <NCard
      size="small"
      :title="t('library.ownership.recent')"
      class="block"
    >
      <NSelect
        v-model:value="sourceFilter"
        :options="sourceOptions"
        :placeholder="t('library.ownership.allSources')"
        clearable
        class="source-filter"
      />
      <NDataTable
        :columns="columns"
        :data="recent"
        :bordered="false"
        size="small"
        :row-key="(row: OwnershipRecentItem) =>
          `${row.video_code}::${row.source}::${row.category}::${row.observed_at ?? ''}::${row.path ?? ''}`"
      />
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
.chart-wrap {
  height: 200px;
}
.source-filter {
  max-width: 220px;
  margin-bottom: 12px;
}
</style>
