<!-- src/pages/library/AcquisitionView.vue -->
<script setup lang="ts">
import { computed, h, onMounted, ref, watch } from 'vue'
import {
  NAlert, NButton, NGrid, NGi, NCard, NStatistic, NDataTable, NSelect, NTag, NSpin, NEmpty,
  type DataTableColumns,
} from 'naive-ui'
import { Bar } from 'vue-chartjs'
import {
  Chart as ChartJS, Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale,
} from 'chart.js'
import { useI18n } from 'vue-i18n'
import {
  getAcquisitionSummary, getAcquisitionRecent, getAcquisitionTrend,
  type AcquisitionSummary, type AcquisitionRecentItem, type AcquisitionTrendPoint,
} from '@/api/library'

ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale)

const { t } = useI18n()

const summary = ref<AcquisitionSummary | null>(null)
const recent = ref<AcquisitionRecentItem[]>([])
const trend = ref<AcquisitionTrendPoint[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const stateFilter = ref<string | null>(null)
// Monotonic token so out-of-order `recent` responses are dropped (newest filter wins).
let recentSeq = 0

const KPI_KEYS = ['queued', 'downloading', 'completed', 'stalled', 'failed'] as const
const FUNNEL_KEYS = ['queued', 'downloading', 'completed'] as const

const stateOptions = computed(() => [
  { label: t('library.allStates'), value: null },
  ...['queued', 'downloading', 'completed', 'in_library', 'stalled', 'failed'].map((s) => ({
    label: t(`library.state.${s}`, s),
    value: s,
  })),
])

const funnelMax = computed(() =>
  Math.max(1, ...FUNNEL_KEYS.map((k) => summary.value?.[k] ?? 0)),
)

function stateTagType(state: string): 'default' | 'info' | 'success' | 'warning' | 'error' {
  return (
    {
      queued: 'default', downloading: 'info', completed: 'success',
      in_library: 'success', stalled: 'warning', failed: 'error',
    } as const
  )[state] ?? 'default'
}

const columns = computed<DataTableColumns<AcquisitionRecentItem>>(() => [
  {
    title: t('library.col.videoCode'),
    key: 'video_code',
    render: (row) =>
      h('span', { style: { fontFamily: 'monospace' } }, row.video_code ?? row.qb_hash.slice(0, 8)),
  },
  { title: t('library.col.category'), key: 'category', render: (row) => row.category ?? '—' },
  {
    title: t('library.col.state'),
    key: 'state',
    render: (row) =>
      h(NTag, { size: 'small', round: true, type: stateTagType(row.state) }, () =>
        t(`library.state.${row.state}`, row.state),
      ),
  },
  { title: t('library.col.queuedAt'), key: 'queued_at', render: (row) => row.queued_at ?? '—' },
  { title: t('library.col.completedAt'), key: 'completed_at', render: (row) => row.completed_at ?? '—' },
])

const trendChartData = computed(() => ({
  labels: trend.value.map((p) => p.date),
  datasets: [
    { label: t('library.state.completed'), data: trend.value.map((p) => p.completed), backgroundColor: '#18a058' },
    { label: t('library.state.stalled'), data: trend.value.map((p) => p.stalled), backgroundColor: '#f0a020' },
    { label: t('library.state.failed'), data: trend.value.map((p) => p.failed), backgroundColor: '#d03050' },
  ],
}))
const trendChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } },
}

async function fetchRecent() {
  const seq = ++recentSeq
  error.value = null // a fresh filter request clears any prior error
  try {
    const rows = await getAcquisitionRecent({ state: stateFilter.value, limit: 50 })
    if (seq === recentSeq) recent.value = rows // ignore stale out-of-order responses
  } catch (err) {
    if (seq === recentSeq) error.value = err instanceof Error ? err.message : t('library.loadError')
  }
}

async function fetchAll() {
  const seq = ++recentSeq
  loading.value = true
  error.value = null
  try {
    const [s, r, tr] = await Promise.all([
      getAcquisitionSummary(),
      getAcquisitionRecent({ state: stateFilter.value, limit: 50 }),
      getAcquisitionTrend('30d'),
    ])
    summary.value = s
    if (seq === recentSeq) recent.value = r // a filter change during load wins
    trend.value = tr
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('library.loadError')
  } finally {
    loading.value = false
  }
}

watch(stateFilter, () => void fetchRecent())
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

    <!-- KPI cards -->
    <NGrid
      :cols="5"
      :x-gap="12"
      :y-gap="12"
      responsive="screen"
      :item-responsive="true"
    >
      <NGi
        v-for="k in KPI_KEYS"
        :key="k"
        span="5 s:5 m:1"
      >
        <NCard size="small">
          <NStatistic
            :label="t(`library.kpi.${k}`)"
            :value="summary?.[k] ?? 0"
          />
        </NCard>
      </NGi>
    </NGrid>

    <!-- Funnel -->
    <NCard
      size="small"
      :title="t('library.funnel')"
      class="block"
    >
      <div class="funnel">
        <div
          v-for="k in FUNNEL_KEYS"
          :key="k"
          class="funnel-stage"
          :style="{ flexGrow: (summary?.[k] ?? 0) / funnelMax + 0.15 }"
        >
          <div
            class="funnel-bar"
            :class="`s-${k}`"
          >
            {{ summary?.[k] ?? 0 }}
          </div>
          <div class="funnel-label">
            {{ t(`library.state.${k}`, k) }}
          </div>
        </div>
      </div>
    </NCard>

    <!-- Trend -->
    <NCard
      size="small"
      :title="t('library.trend')"
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

    <!-- Recent table -->
    <NCard
      size="small"
      :title="t('library.recent')"
      class="block"
    >
      <NSelect
        v-model:value="stateFilter"
        :options="stateOptions"
        clearable
        class="state-filter"
      />
      <NDataTable
        :columns="columns"
        :data="recent"
        :bordered="false"
        size="small"
        :row-key="(row: AcquisitionRecentItem) => row.qb_hash"
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
.funnel {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}
.funnel-stage {
  flex-basis: 0;
  text-align: center;
}
.funnel-bar {
  color: #fff;
  padding: 16px 8px;
  border-radius: 6px;
  font-weight: 700;
}
.s-queued { background: #909399; }
.s-downloading { background: #2080f0; }
.s-completed { background: #18a058; }
.funnel-label {
  margin-top: 6px;
  font-size: 12px;
}
.chart-wrap {
  height: 260px;
}
.state-filter {
  max-width: 220px;
  margin-bottom: 12px;
}
</style>
