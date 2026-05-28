<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { NAlert, NButton, NCard, NGrid, NGi, NSpin } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import { Line } from 'vue-chartjs'
import { getStatsTrend, type TrendResponse } from '@/api/stats'
import { percentLineOptions } from '../chartOptions'

const props = defineProps<{ period: string }>()

const { t } = useI18n()
const loading = ref(false)
const error = ref<string | null>(null)

const uploadSuccessTrend = ref<TrendResponse | null>(null)
const duplicateRateTrend = ref<TrendResponse | null>(null)

async function fetchData() {
  loading.value = true
  error.value = null
  try {
    const [uploadSuccess, duplicateRate] = await Promise.all([
      getStatsTrend('upload_success_rate', props.period),
      getStatsTrend('duplicate_rate', props.period),
    ])
    uploadSuccessTrend.value = uploadSuccess
    duplicateRateTrend.value = duplicateRate
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
  }
}

watch(() => props.period, fetchData)
onMounted(fetchData)

const uploadSuccessData = computed(() => ({
  labels: uploadSuccessTrend.value?.data_points.map((point) => point.date) ?? [],
  datasets: [
    {
      label: t('stats.uploadSuccessRate'),
      data: uploadSuccessTrend.value?.data_points.map((point) => Math.round(point.value * 100)) ?? [],
      borderColor: '#18a058',
      backgroundColor: 'rgba(24,160,88,0.1)',
      fill: true,
      tension: 0.3,
    },
  ],
}))

const duplicateRateData = computed(() => ({
  labels: duplicateRateTrend.value?.data_points.map((point) => point.date) ?? [],
  datasets: [
    {
      label: t('stats.duplicateRate'),
      data: duplicateRateTrend.value?.data_points.map((point) => Math.round(point.value * 100)) ?? [],
      borderColor: '#f0a020',
      backgroundColor: 'rgba(240,160,32,0.1)',
      fill: true,
      tension: 0.3,
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
          :title="t('stats.uploadSuccessRate')"
          size="small"
        >
          <div class="chart-wrap">
            <Line
              v-if="(uploadSuccessTrend?.data_points.length ?? 0) > 0"
              :data="uploadSuccessData"
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
          :title="t('stats.duplicateRate')"
          size="small"
        >
          <div class="chart-wrap">
            <Line
              v-if="(duplicateRateTrend?.data_points.length ?? 0) > 0"
              :data="duplicateRateData"
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
