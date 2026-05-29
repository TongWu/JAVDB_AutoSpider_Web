<script setup lang="ts">
import { computed } from 'vue'
import { NCard, NGrid, NGi } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import { Line, Bar } from 'vue-chartjs'
import type { TrendResponse } from '@/api/stats'
import { barChartOptions, durationLineOptions, percentLineOptions } from '../chartOptions'

const props = defineProps<{
  successRateTrend: TrendResponse | null
  durationTrend: TrendResponse | null
  moviesTrend: TrendResponse | null
  torrentsTrend: TrendResponse | null
}>()

const { t } = useI18n()

const successRateChartData = computed(() => ({
  labels: props.successRateTrend?.data_points.map((d) => d.date) ?? [],
  datasets: [
    {
      label: t('stats.successRate'),
      data: props.successRateTrend?.data_points.map((d) => Math.round(d.value * 100)) ?? [],
      borderColor: '#18a058',
      backgroundColor: 'rgba(24,160,88,0.1)',
      fill: true,
      tension: 0.3,
    },
  ],
}))

const moviesChartData = computed(() => ({
  labels: props.moviesTrend?.data_points.map((d) => d.date) ?? [],
  datasets: [
    {
      label: t('stats.dailyMovies'),
      data: props.moviesTrend?.data_points.map((d) => d.value) ?? [],
      backgroundColor: 'rgba(99,149,255,0.7)',
    },
  ],
}))

const durationChartData = computed(() => ({
  labels: props.durationTrend?.data_points.map((d) => d.date) ?? [],
  datasets: [
    {
      label: t('stats.avgDuration'),
      data: props.durationTrend?.data_points.map((d) => d.value) ?? [],
      borderColor: '#f0a020',
      backgroundColor: 'rgba(240,160,32,0.1)',
      fill: true,
      tension: 0.3,
    },
  ],
}))

const torrentsChartData = computed(() => ({
  labels: props.torrentsTrend?.data_points.map((d) => d.date) ?? [],
  datasets: [
    {
      label: t('stats.dailyTorrents'),
      data: props.torrentsTrend?.data_points.map((d) => d.value) ?? [],
      backgroundColor: 'rgba(64,158,255,0.7)',
    },
  ],
}))
</script>

<template>
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
        :title="t('stats.avgDuration')"
        size="small"
      >
        <div class="chart-wrap">
          <Line
            v-if="(durationTrend?.data_points.length ?? 0) > 0"
            :data="durationChartData"
            :options="durationLineOptions"
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
        :title="t('stats.dailyMovies')"
        size="small"
      >
        <div class="chart-wrap">
          <Bar
            v-if="(moviesTrend?.data_points.length ?? 0) > 0"
            :data="moviesChartData"
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
    <NGi span="2 m:1">
      <NCard
        :title="t('stats.dailyTorrents')"
        size="small"
      >
        <div class="chart-wrap">
          <Bar
            v-if="(torrentsTrend?.data_points.length ?? 0) > 0"
            :data="torrentsChartData"
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
