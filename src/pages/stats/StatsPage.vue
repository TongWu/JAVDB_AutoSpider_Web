<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  NCard,
  NGrid,
  NGi,
  NStatistic,
  NTabs,
  NTabPane,
  NSelect,
  NSpin,
  NAlert,
  NButton,
} from 'naive-ui'
import { useI18n } from 'vue-i18n'
import { Line, Bar } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import {
  getStatsSummary,
  getStatsTrend,
  type StatsSummary,
  type TrendResponse,
} from '@/api/stats'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
)

const { t } = useI18n()

// --- State ---
const loadingSummary = ref(false)
const summaryError = ref<string | null>(null)
const summary = ref<StatsSummary | null>(null)

const activeTab = ref('runs')
const period = ref('30d')

const loadingTrends = ref(false)
const trendsError = ref<string | null>(null)

const successRateTrend = ref<TrendResponse | null>(null)
const moviesTrend = ref<TrendResponse | null>(null)
const historyGrowthTrend = ref<TrendResponse | null>(null)
const pikpakTrend = ref<TrendResponse | null>(null)
const proxyBansTrend = ref<TrendResponse | null>(null)
const dedupTrend = ref<TrendResponse | null>(null)

// --- Period options ---
const periodOptions = computed(() => [
  { label: t('stats.period.7d'), value: '7d' },
  { label: t('stats.period.30d'), value: '30d' },
  { label: t('stats.period.90d'), value: '90d' },
])

// --- Helpers ---
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function formatSuccessRate(rate: number | null): string {
  if (rate === null) return t('stats.na')
  return `${(rate * 100).toFixed(1)}%`
}

function formatDuration(secs: number | null): string {
  if (secs === null) return t('stats.na')
  return t('stats.seconds', { n: Math.round(secs) })
}

// --- Chart data ---
const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
  },
  scales: {
    x: { grid: { display: false } },
  },
}

const successRateChartData = computed(() => ({
  labels: successRateTrend.value?.data_points.map((d) => d.date) ?? [],
  datasets: [
    {
      label: t('stats.successRate'),
      data: successRateTrend.value?.data_points.map((d) => Math.round(d.value * 100)) ?? [],
      borderColor: '#18a058',
      backgroundColor: 'rgba(24,160,88,0.1)',
      fill: true,
      tension: 0.3,
    },
  ],
}))

const moviesChartData = computed(() => ({
  labels: moviesTrend.value?.data_points.map((d) => d.date) ?? [],
  datasets: [
    {
      label: t('stats.totalMovies'),
      data: moviesTrend.value?.data_points.map((d) => d.value) ?? [],
      backgroundColor: 'rgba(99,149,255,0.7)',
    },
  ],
}))

const historyGrowthChartData = computed(() => ({
  labels: historyGrowthTrend.value?.data_points.map((d) => d.date) ?? [],
  datasets: [
    {
      label: t('stats.totalMovies'),
      data: historyGrowthTrend.value?.data_points.map((d) => d.value) ?? [],
      borderColor: '#6395ff',
      backgroundColor: 'rgba(99,149,255,0.1)',
      fill: true,
      tension: 0.3,
    },
  ],
}))

const pikpakChartData = computed(() => ({
  labels: pikpakTrend.value?.data_points.map((d) => d.date) ?? [],
  datasets: [
    {
      label: t('stats.pikpakVolume'),
      data: pikpakTrend.value?.data_points.map((d) => d.value) ?? [],
      borderColor: '#f0a020',
      backgroundColor: 'rgba(240,160,32,0.1)',
      fill: true,
      tension: 0.3,
    },
  ],
}))

const proxyBansChartData = computed(() => ({
  labels: proxyBansTrend.value?.data_points.map((d) => d.date) ?? [],
  datasets: [
    {
      label: t('stats.proxyBans'),
      data: proxyBansTrend.value?.data_points.map((d) => d.value) ?? [],
      borderColor: '#d03050',
      backgroundColor: 'rgba(208,48,80,0.1)',
      fill: true,
      tension: 0.3,
    },
  ],
}))

const dedupChartData = computed(() => ({
  labels: dedupTrend.value?.data_points.map((d) => d.date) ?? [],
  datasets: [
    {
      label: t('stats.dedupFreed'),
      data: dedupTrend.value?.data_points.map((d) => d.value) ?? [],
      backgroundColor: 'rgba(114,46,209,0.7)',
    },
  ],
}))

// --- Data fetching ---
async function fetchSummary() {
  loadingSummary.value = true
  summaryError.value = null
  try {
    summary.value = await getStatsSummary()
  } catch (err) {
    summaryError.value = err instanceof Error ? err.message : String(err)
  } finally {
    loadingSummary.value = false
  }
}

async function fetchTrendsForTab(tab: string) {
  loadingTrends.value = true
  trendsError.value = null
  try {
    if (tab === 'runs') {
      const [sr, mv] = await Promise.all([
        getStatsTrend('success_rate', period.value),
        getStatsTrend('movies_per_run', period.value),
      ])
      successRateTrend.value = sr
      moviesTrend.value = mv
    } else if (tab === 'growth') {
      const [hg, pp] = await Promise.all([
        getStatsTrend('history_growth', period.value),
        getStatsTrend('pikpak_volume', period.value),
      ])
      historyGrowthTrend.value = hg
      pikpakTrend.value = pp
    } else if (tab === 'system') {
      const [pb, dd] = await Promise.all([
        getStatsTrend('proxy_bans', period.value),
        getStatsTrend('dedup_freed_bytes', period.value),
      ])
      proxyBansTrend.value = pb
      dedupTrend.value = dd
    }
  } catch (err) {
    trendsError.value = err instanceof Error ? err.message : String(err)
  } finally {
    loadingTrends.value = false
  }
}

watch([activeTab, period], ([tab]) => {
  void fetchTrendsForTab(tab)
})

onMounted(() => {
  void fetchSummary()
  void fetchTrendsForTab(activeTab.value)
})
</script>

<template>
  <div class="stats-page">
    <header class="page-header">
      <h1>{{ t('nav.stats') }}</h1>
      <p class="subtitle">
        {{ t('stats.subtitle') }}
      </p>
    </header>

    <!-- Summary cards -->
    <NSpin :show="loadingSummary">
      <NAlert
        v-if="summaryError"
        type="error"
        class="summary-error"
      >
        {{ summaryError }}
        <NButton
          size="small"
          style="margin-left: 12px"
          @click="fetchSummary"
        >
          {{ t('common.retry') }}
        </NButton>
      </NAlert>

      <NGrid
        v-else
        :cols="4"
        :x-gap="12"
        :y-gap="12"
        responsive="screen"
        :item-responsive="true"
        class="summary-grid"
      >
        <NGi span="4 s:2 m:1">
          <NCard size="small">
            <NStatistic
              :label="t('stats.totalRuns')"
              :value="summary?.total_runs ?? '—'"
            />
          </NCard>
        </NGi>
        <NGi span="4 s:2 m:1">
          <NCard size="small">
            <NStatistic
              :label="t('stats.successRate')"
              :value="formatSuccessRate(summary?.success_rate ?? null)"
            />
          </NCard>
        </NGi>
        <NGi span="4 s:2 m:1">
          <NCard size="small">
            <NStatistic
              :label="t('stats.avgDuration')"
              :value="formatDuration(summary?.avg_duration_seconds ?? null)"
            />
          </NCard>
        </NGi>
        <NGi span="4 s:2 m:1">
          <NCard size="small">
            <NStatistic
              :label="t('stats.totalMovies')"
              :value="summary?.total_movies ?? '—'"
            />
          </NCard>
        </NGi>

        <NGi span="4 s:2 m:1">
          <NCard size="small">
            <NStatistic
              :label="t('stats.totalTorrents')"
              :value="summary?.total_torrents ?? '—'"
            />
          </NCard>
        </NGi>
        <NGi span="4 s:2 m:1">
          <NCard size="small">
            <NStatistic
              :label="t('stats.pikpakVolume')"
              :value="summary?.total_pikpak ?? '—'"
            />
          </NCard>
        </NGi>
        <NGi span="4 s:2 m:1">
          <NCard size="small">
            <NStatistic
              :label="t('stats.dedupFreed')"
              :value="summary != null ? formatBytes(summary.total_dedup_freed_bytes) : '—'"
            />
          </NCard>
        </NGi>
        <NGi span="4 s:2 m:1">
          <NCard size="small">
            <NStatistic
              :label="t('stats.proxyBans')"
              :value="summary?.proxy_bans_last_7d ?? '—'"
            />
          </NCard>
        </NGi>
      </NGrid>
    </NSpin>

    <!-- Charts section -->
    <NCard
      class="charts-card"
      :bordered="false"
    >
      <div class="charts-toolbar">
        <NSelect
          v-model:value="period"
          :options="periodOptions"
          size="small"
          style="width: 120px"
        />
      </div>

      <NSpin :show="loadingTrends">
        <NAlert
          v-if="trendsError"
          type="error"
          class="trends-error"
        >
          {{ trendsError }}
          <NButton
            size="small"
            style="margin-left: 12px"
            @click="fetchTrendsForTab(activeTab)"
          >
            {{ t('common.retry') }}
          </NButton>
        </NAlert>

        <NTabs
          v-model:value="activeTab"
          type="line"
          animated
        >
          <!-- Run Metrics -->
          <NTabPane
            name="runs"
            :tab="t('stats.tabs.runs')"
          >
            <NGrid
              :cols="2"
              :x-gap="16"
              :y-gap="16"
              responsive="screen"
              :item-responsive="true"
              class="charts-grid"
            >
              <NGi span="2 m:1">
                <NCard
                  :title="t('stats.successRate')"
                  size="small"
                >
                  <div class="chart-wrap">
                    <Line
                      v-if="(successRateTrend?.data_points.length ?? 0) > 0"
                      :data="successRateChartData"
                      :options="chartOptions"
                    />
                    <p
                      v-else
                      class="no-data"
                    >
                      {{ t('stats.noData') }}
                    </p>
                  </div>
                </NCard>
              </NGi>
              <NGi span="2 m:1">
                <NCard
                  :title="t('stats.totalMovies')"
                  size="small"
                >
                  <div class="chart-wrap">
                    <Bar
                      v-if="(moviesTrend?.data_points.length ?? 0) > 0"
                      :data="moviesChartData"
                      :options="chartOptions"
                    />
                    <p
                      v-else
                      class="no-data"
                    >
                      {{ t('stats.noData') }}
                    </p>
                  </div>
                </NCard>
              </NGi>
            </NGrid>
          </NTabPane>

          <!-- Growth -->
          <NTabPane
            name="growth"
            :tab="t('stats.tabs.growth')"
          >
            <NGrid
              :cols="2"
              :x-gap="16"
              :y-gap="16"
              responsive="screen"
              :item-responsive="true"
              class="charts-grid"
            >
              <NGi span="2 m:1">
                <NCard
                  :title="t('stats.totalMovies')"
                  size="small"
                >
                  <div class="chart-wrap">
                    <Line
                      v-if="(historyGrowthTrend?.data_points.length ?? 0) > 0"
                      :data="historyGrowthChartData"
                      :options="chartOptions"
                    />
                    <p
                      v-else
                      class="no-data"
                    >
                      {{ t('stats.noData') }}
                    </p>
                  </div>
                </NCard>
              </NGi>
              <NGi span="2 m:1">
                <NCard
                  :title="t('stats.pikpakVolume')"
                  size="small"
                >
                  <div class="chart-wrap">
                    <Line
                      v-if="(pikpakTrend?.data_points.length ?? 0) > 0"
                      :data="pikpakChartData"
                      :options="chartOptions"
                    />
                    <p
                      v-else
                      class="no-data"
                    >
                      {{ t('stats.noData') }}
                    </p>
                  </div>
                </NCard>
              </NGi>
            </NGrid>
          </NTabPane>

          <!-- System -->
          <NTabPane
            name="system"
            :tab="t('stats.tabs.system')"
          >
            <NGrid
              :cols="2"
              :x-gap="16"
              :y-gap="16"
              responsive="screen"
              :item-responsive="true"
              class="charts-grid"
            >
              <NGi span="2 m:1">
                <NCard
                  :title="t('stats.proxyBans')"
                  size="small"
                >
                  <div class="chart-wrap">
                    <Line
                      v-if="(proxyBansTrend?.data_points.length ?? 0) > 0"
                      :data="proxyBansChartData"
                      :options="chartOptions"
                    />
                    <p
                      v-else
                      class="no-data"
                    >
                      {{ t('stats.noData') }}
                    </p>
                  </div>
                </NCard>
              </NGi>
              <NGi span="2 m:1">
                <NCard
                  :title="t('stats.dedupFreed')"
                  size="small"
                >
                  <div class="chart-wrap">
                    <Bar
                      v-if="(dedupTrend?.data_points.length ?? 0) > 0"
                      :data="dedupChartData"
                      :options="chartOptions"
                    />
                    <p
                      v-else
                      class="no-data"
                    >
                      {{ t('stats.noData') }}
                    </p>
                  </div>
                </NCard>
              </NGi>
            </NGrid>
          </NTabPane>
        </NTabs>
      </NSpin>
    </NCard>
  </div>
</template>

<style scoped>
.stats-page {
  padding: 24px;
  max-width: 1200px;
}

.page-header {
  margin-bottom: 24px;
}

.page-header h1 {
  margin: 0 0 4px;
  font-size: 22px;
  font-weight: 600;
}

.subtitle {
  margin: 0;
  color: var(--n-text-color-3, #999);
  font-size: 13px;
}

.summary-error,
.trends-error {
  margin-bottom: 16px;
}

.summary-grid {
  margin-bottom: 24px;
}

.charts-card {
  padding: 0;
}

.charts-toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 12px;
}

.charts-grid {
  margin-top: 16px;
}

.chart-wrap {
  height: 240px;
  position: relative;
}

.no-data {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--n-text-color-3, #999);
  font-size: 13px;
  margin: 0;
}
</style>
