<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { NAlert, NButton, NCard, NGrid, NGi, NSpin } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import { Line, Bar } from 'vue-chartjs'
import { getStatsDistribution, getStatsTrend, type DistributionResponse, type TrendResponse } from '@/api/stats'
import { barChartOptions, ratingLineOptions } from '../chartOptions'

const props = defineProps<{ period: string }>()

const { t } = useI18n()
const loading = ref(false)
const error = ref<string | null>(null)

const avgRatingTrend = ref<TrendResponse | null>(null)
const ratingDist = ref<DistributionResponse | null>(null)

async function fetchData() {
  loading.value = true
  error.value = null
  try {
    const [avgRating, ratingDistribution] = await Promise.all([
      getStatsTrend('avg_rating', props.period),
      getStatsDistribution('rating_distribution', props.period),
    ])
    avgRatingTrend.value = avgRating
    ratingDist.value = ratingDistribution
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
  }
}

watch(() => props.period, fetchData)
onMounted(fetchData)

const avgRatingData = computed(() => ({
  labels: avgRatingTrend.value?.data_points.map((point) => point.date) ?? [],
  datasets: [
    {
      label: t('stats.avgRating'),
      data: avgRatingTrend.value?.data_points.map((point) => Math.round(point.value * 10) / 10) ?? [],
      borderColor: '#f0a020',
      backgroundColor: 'rgba(240,160,32,0.1)',
      fill: true,
      tension: 0.3,
    },
  ],
}))

const ratingDistData = computed(() => ({
  labels: ratingDist.value?.buckets.map((bucket) => bucket.label) ?? [],
  datasets: [
    {
      label: t('stats.ratingDistribution'),
      data: ratingDist.value?.buckets.map((bucket) => bucket.value) ?? [],
      backgroundColor: [
        'rgba(208,48,80,0.7)',
        'rgba(240,160,32,0.7)',
        'rgba(99,149,255,0.7)',
        'rgba(24,160,88,0.7)',
        'rgba(114,46,209,0.7)',
      ],
    },
  ],
}))
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
      <NGi span="2 m:1">
        <NCard
          :title="t('stats.avgRating')"
          size="small"
        >
          <div class="chart-wrap">
            <Line
              v-if="(avgRatingTrend?.data_points.length ?? 0) > 0"
              :data="avgRatingData"
              :options="ratingLineOptions"
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
          :title="t('stats.ratingDistribution')"
          size="small"
        >
          <div class="chart-wrap">
            <Bar
              v-if="(ratingDist?.buckets.length ?? 0) > 0"
              :data="ratingDistData"
              :options="barChartOptions"
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
