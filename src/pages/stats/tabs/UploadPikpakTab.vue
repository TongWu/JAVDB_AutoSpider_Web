<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { NCard, NGrid, NGi, NSpin } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import { Line, Bar } from 'vue-chartjs'
import { getStatsTrend, type TrendResponse } from '@/api/stats'
import { percentLineOptions, stackedBarOptions } from '../chartOptions'

const props = defineProps<{ period: string }>()

const { t } = useI18n()
const loading = ref(false)

const pikpakSuccessTrend = ref<TrendResponse | null>(null)
const pikpakFailedTrend = ref<TrendResponse | null>(null)
const pikpakDeleteFailedTrend = ref<TrendResponse | null>(null)

async function fetchData() {
  loading.value = true
  try {
    const [pikpakSuccess, pikpakFailed, pikpakDeleteFailed] = await Promise.all([
      getStatsTrend('pikpak_success_rate', props.period),
      getStatsTrend('pikpak_failed', props.period),
      getStatsTrend('pikpak_delete_failed', props.period),
    ])
    pikpakSuccessTrend.value = pikpakSuccess
    pikpakFailedTrend.value = pikpakFailed
    pikpakDeleteFailedTrend.value = pikpakDeleteFailed
  } finally {
    loading.value = false
  }
}

watch(() => props.period, fetchData)
onMounted(fetchData)

const pikpakSuccessData = computed(() => ({
  labels: pikpakSuccessTrend.value?.data_points.map((point) => point.date) ?? [],
  datasets: [
    {
      label: t('stats.pikpakSuccessRate'),
      data: pikpakSuccessTrend.value?.data_points.map((point) => Math.round(point.value * 100)) ?? [],
      borderColor: '#18a058',
      backgroundColor: 'rgba(24,160,88,0.1)',
      fill: true,
      tension: 0.3,
    },
  ],
}))

const failureDetailData = computed(() => {
  const dateSet = new Set<string>()
  for (const trend of [pikpakFailedTrend.value, pikpakDeleteFailedTrend.value]) {
    for (const point of trend?.data_points ?? []) dateSet.add(point.date)
  }
  const dates = [...dateSet].sort()
  const failedMap = new Map((pikpakFailedTrend.value?.data_points ?? []).map((point) => [point.date, point.value]))
  const deleteFailedMap = new Map(
    (pikpakDeleteFailedTrend.value?.data_points ?? []).map((point) => [point.date, point.value]),
  )

  return {
    labels: dates,
    datasets: [
      {
        label: t('stats.pikpakFailed'),
        data: dates.map((date) => failedMap.get(date) ?? 0),
        backgroundColor: '#d03050',
      },
      {
        label: t('stats.pikpakDeleteFailed'),
        data: dates.map((date) => deleteFailedMap.get(date) ?? 0),
        backgroundColor: '#f0a020',
      },
    ],
  }
})

const hasFailureDetailData = computed(() => failureDetailData.value.labels.length > 0)
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
          :title="t('stats.pikpakSuccessRate')"
          size="small"
        >
          <div class="chart-wrap">
            <Line
              v-if="(pikpakSuccessTrend?.data_points.length ?? 0) > 0"
              :data="pikpakSuccessData"
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
          :title="t('stats.pikpakFailureDetail')"
          size="small"
        >
          <div class="chart-wrap">
            <Bar
              v-if="hasFailureDetailData"
              :data="failureDetailData"
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
