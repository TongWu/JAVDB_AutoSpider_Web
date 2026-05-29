<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { NAlert, NButton, NCard, NGrid, NGi, NSpin } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import { Line, Bar } from 'vue-chartjs'
import { getStatsTrend, type TrendResponse } from '@/api/stats'
import { percentLineOptions, stackedBarOptions } from '../chartOptions'

const props = defineProps<{ period: string }>()

const { t } = useI18n()
const loading = ref(false)
const error = ref<string | null>(null)

const processedTrend = ref<TrendResponse | null>(null)
const skippedTrend = ref<TrendResponse | null>(null)
const noNewTrend = ref<TrendResponse | null>(null)
const failedTrend = ref<TrendResponse | null>(null)
const efficiencyTrend = ref<TrendResponse | null>(null)
const skipRateTrend = ref<TrendResponse | null>(null)
const failureRateTrend = ref<TrendResponse | null>(null)
let latestRequestId = 0

async function fetchData() {
  const requestId = ++latestRequestId
  const period = props.period
  loading.value = true
  error.value = null
  try {
    const [processed, skipped, noNew, failed, efficiency, skipRate, failureRate] =
      await Promise.all([
        getStatsTrend('spider_processed', period),
        getStatsTrend('spider_skipped', period),
        getStatsTrend('spider_nonew', period),
        getStatsTrend('spider_failed', period),
        getStatsTrend('spider_efficiency', period),
        getStatsTrend('spider_skip_rate', period),
        getStatsTrend('spider_failure_rate', period),
      ])
    if (requestId !== latestRequestId) return
    processedTrend.value = processed
    skippedTrend.value = skipped
    noNewTrend.value = noNew
    failedTrend.value = failed
    efficiencyTrend.value = efficiency
    skipRateTrend.value = skipRate
    failureRateTrend.value = failureRate
  } catch (err) {
    if (requestId !== latestRequestId) return
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    if (requestId === latestRequestId) {
      loading.value = false
    }
  }
}

watch(() => props.period, fetchData)
onMounted(fetchData)

const breakdownChartData = computed(() => {
  const dateSet = new Set<string>()
  for (const trend of [processedTrend.value, skippedTrend.value, noNewTrend.value, failedTrend.value]) {
    for (const point of trend?.data_points ?? []) dateSet.add(point.date)
  }
  const dates = [...dateSet].sort()
  const toMap = (trend: TrendResponse | null) =>
    new Map((trend?.data_points ?? []).map((point) => [point.date, point.value]))
  const processed = toMap(processedTrend.value)
  const skipped = toMap(skippedTrend.value)
  const noNew = toMap(noNewTrend.value)
  const failed = toMap(failedTrend.value)

  return {
    labels: dates,
    datasets: [
      {
        label: t('stats.spiderProcessed'),
        data: dates.map((date) => processed.get(date) ?? 0),
        backgroundColor: '#18a058',
      },
      {
        label: t('stats.spiderSkipped'),
        data: dates.map((date) => skipped.get(date) ?? 0),
        backgroundColor: '#a0a0a0',
      },
      {
        label: t('stats.spiderNoNew'),
        data: dates.map((date) => noNew.get(date) ?? 0),
        backgroundColor: '#6395ff',
      },
      {
        label: t('stats.spiderFailed'),
        data: dates.map((date) => failed.get(date) ?? 0),
        backgroundColor: '#d03050',
      },
    ],
  }
})

function ratioChartData(trend: TrendResponse | null, label: string, color: string) {
  return {
    labels: trend?.data_points.map((point) => point.date) ?? [],
    datasets: [
      {
        label,
        data: trend?.data_points.map((point) => Math.round(point.value * 100)) ?? [],
        borderColor: color,
        backgroundColor: `${color}1a`,
        fill: true,
        tension: 0.3,
      },
    ],
  }
}

const efficiencyData = computed(() =>
  ratioChartData(efficiencyTrend.value, t('stats.discoveryEfficiency'), '#18a058'),
)
const skipRateData = computed(() =>
  ratioChartData(skipRateTrend.value, t('stats.skipRate'), '#a0a0a0'),
)
const failureRateData = computed(() =>
  ratioChartData(failureRateTrend.value, t('stats.failureRate'), '#d03050'),
)

const hasBreakdownData = computed(() => breakdownChartData.value.labels.length > 0)
</script>

<template>
  <NSpin :show="loading">
    <NAlert
      v-if="error"
      type="error"
      class="chart-error"
    >
      {{ error }}
      <NButton
        size="small"
        style="margin-left: 12px"
        @click="fetchData"
      >
        {{ t('common.retry') }}
      </NButton>
    </NAlert>

    <NGrid
      v-else
      :cols="2"
      :x-gap="16"
      :y-gap="16"
      responsive="screen"
      :item-responsive="true"
      class="charts-grid"
    >
      <NGi span="2">
        <NCard
          :title="t('stats.phaseBreakdown')"
          size="small"
        >
          <div class="chart-wrap">
            <Bar
              v-if="hasBreakdownData"
              :data="breakdownChartData"
              :options="stackedBarOptions"
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
          :title="t('stats.discoveryEfficiency')"
          size="small"
        >
          <div class="chart-wrap">
            <Line
              v-if="(efficiencyTrend?.data_points.length ?? 0) > 0"
              :data="efficiencyData"
              :options="percentLineOptions"
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
          :title="t('stats.skipRate')"
          size="small"
        >
          <div class="chart-wrap">
            <Line
              v-if="(skipRateTrend?.data_points.length ?? 0) > 0"
              :data="skipRateData"
              :options="percentLineOptions"
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
          :title="t('stats.failureRate')"
          size="small"
        >
          <div class="chart-wrap">
            <Line
              v-if="(failureRateTrend?.data_points.length ?? 0) > 0"
              :data="failureRateData"
              :options="percentLineOptions"
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
  </NSpin>
</template>

<style scoped>
.charts-grid {
  margin-top: 16px;
}

.chart-error {
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
