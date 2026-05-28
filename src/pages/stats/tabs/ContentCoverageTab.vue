<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { NCard, NGrid, NGi, NSpin } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import { Line, Doughnut } from 'vue-chartjs'
import { Chart as ChartJS, DoughnutController, ArcElement } from 'chart.js'
import { getStatsDistribution, getStatsTrend, type DistributionResponse, type TrendResponse } from '@/api/stats'
import { doughnutOptions, dualLineOptions, percentLineOptions } from '../chartOptions'

ChartJS.register(DoughnutController, ArcElement)

const props = defineProps<{ period: string }>()

const { t } = useI18n()
const loading = ref(false)

const subtitleTrend = ref<TrendResponse | null>(null)
const resolutionDist = ref<DistributionResponse | null>(null)
const hiresTrend = ref<TrendResponse | null>(null)
const perfectMatchTrend = ref<TrendResponse | null>(null)

async function fetchData() {
  loading.value = true
  try {
    const [subtitleCoverage, resolutionDistribution, hiresRatio, perfectMatchRatio] =
      await Promise.all([
        getStatsTrend('subtitle_coverage', props.period),
        getStatsDistribution('resolution_distribution', props.period),
        getStatsTrend('hires_ratio', props.period),
        getStatsTrend('perfectmatch_ratio', props.period),
      ])
    subtitleTrend.value = subtitleCoverage
    resolutionDist.value = resolutionDistribution
    hiresTrend.value = hiresRatio
    perfectMatchTrend.value = perfectMatchRatio
  } finally {
    loading.value = false
  }
}

watch(() => props.period, fetchData)
onMounted(fetchData)

const subtitleData = computed(() => ({
  labels: subtitleTrend.value?.data_points.map((point) => point.date) ?? [],
  datasets: [
    {
      label: t('stats.subtitleCoverage'),
      data: subtitleTrend.value?.data_points.map((point) => Math.round(point.value * 100)) ?? [],
      borderColor: '#18a058',
      backgroundColor: 'rgba(24,160,88,0.1)',
      fill: true,
      tension: 0.3,
    },
  ],
}))

const resolutionColors = ['#a0a0a0', '#f0a020', '#18a058', '#722ed1', '#6395ff']

const resolutionData = computed(() => ({
  labels: resolutionDist.value?.buckets.map((bucket) => bucket.label) ?? [],
  datasets: [
    {
      data: resolutionDist.value?.buckets.map((bucket) => bucket.value) ?? [],
      backgroundColor: resolutionDist.value?.buckets.map((_, index) => resolutionColors[index] ?? '#6395ff') ?? [],
    },
  ],
}))

const hiresMatchData = computed(() => {
  const dateSet = new Set<string>()
  for (const trend of [hiresTrend.value, perfectMatchTrend.value]) {
    for (const point of trend?.data_points ?? []) dateSet.add(point.date)
  }
  const dates = [...dateSet].sort()
  const toMap = (trend: TrendResponse | null) =>
    new Map((trend?.data_points ?? []).map((point) => [point.date, point.value]))
  const hires = toMap(hiresTrend.value)
  const perfectMatch = toMap(perfectMatchTrend.value)

  return {
    labels: dates,
    datasets: [
      {
        label: t('stats.hiresRatio'),
        data: dates.map((date) => Math.round((hires.get(date) ?? 0) * 100)),
        borderColor: '#722ed1',
        backgroundColor: 'rgba(114,46,209,0.1)',
        fill: false,
        tension: 0.3,
      },
      {
        label: t('stats.perfectMatchRatio'),
        data: dates.map((date) => Math.round((perfectMatch.get(date) ?? 0) * 100)),
        borderColor: '#18a058',
        backgroundColor: 'rgba(24,160,88,0.1)',
        fill: false,
        tension: 0.3,
      },
    ],
  }
})

const hasHiresMatchData = computed(() => hiresMatchData.value.labels.length > 0)
</script>

<template>
  <NSpin :show="loading">
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
          :title="t('stats.subtitleCoverage')"
          size="small"
        >
          <div class="chart-wrap">
            <Line
              v-if="(subtitleTrend?.data_points.length ?? 0) > 0"
              :data="subtitleData"
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
          :title="t('stats.resolutionDistribution')"
          size="small"
        >
          <div class="chart-wrap">
            <Doughnut
              v-if="(resolutionDist?.buckets.length ?? 0) > 0"
              :data="resolutionData"
              :options="doughnutOptions"
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
      <NGi span="2">
        <NCard
          :title="`${t('stats.hiresRatio')} / ${t('stats.perfectMatchRatio')}`"
          size="small"
        >
          <div class="chart-wrap">
            <Line
              v-if="hasHiresMatchData"
              :data="hiresMatchData"
              :options="dualLineOptions"
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
