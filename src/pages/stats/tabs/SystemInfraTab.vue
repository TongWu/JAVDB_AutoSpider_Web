<script setup lang="ts">
import { computed } from 'vue'
import { NCard, NGrid, NGi } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import { Line, Bar } from 'vue-chartjs'
import type { TrendResponse } from '@/api/stats'
import { bytesBarOptions, lineChartOptions } from '../chartOptions'

const props = defineProps<{
  proxyBansTrend: TrendResponse | null
  dedupTrend: TrendResponse | null
}>()

const { t } = useI18n()

const proxyBansChartData = computed(() => ({
  labels: props.proxyBansTrend?.data_points.map((d) => d.date) ?? [],
  datasets: [
    {
      label: t('stats.proxyBans'),
      data: props.proxyBansTrend?.data_points.map((d) => d.value) ?? [],
      borderColor: '#d03050',
      backgroundColor: 'rgba(208,48,80,0.1)',
      fill: true,
      tension: 0.3,
    },
  ],
}))

const dedupChartData = computed(() => ({
  labels: props.dedupTrend?.data_points.map((d) => d.date) ?? [],
  datasets: [
    {
      label: t('stats.dedupFreed'),
      data: props.dedupTrend?.data_points.map((d) => d.value) ?? [],
      backgroundColor: 'rgba(114,46,209,0.7)',
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
        :title="t('stats.proxyBans')"
        size="small"
      >
        <div class="chart-wrap">
          <Line
            v-if="(proxyBansTrend?.data_points.length ?? 0) > 0"
            :data="proxyBansChartData"
            :options="lineChartOptions"
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
            :options="bytesBarOptions"
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
