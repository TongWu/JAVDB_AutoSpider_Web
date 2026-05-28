<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { NAlert, NButton, NCard, NGrid, NGi, NSpin } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import { Bar } from 'vue-chartjs'
import { getStatsTrend, type TrendResponse } from '@/api/stats'
import { barChartOptions, stackedBarOptions } from '../chartOptions'

const props = defineProps<{ period: string }>()

const { t } = useI18n()
const loading = ref(false)
const error = ref<string | null>(null)

const emailSentTrend = ref<TrendResponse | null>(null)
const emailFailedTrend = ref<TrendResponse | null>(null)
const emailResentTrend = ref<TrendResponse | null>(null)
const incidentsTrend = ref<TrendResponse | null>(null)

async function fetchData() {
  loading.value = true
  error.value = null
  try {
    const [emailSent, emailFailed, emailResent, incidents] = await Promise.all([
      getStatsTrend('email_sent', props.period),
      getStatsTrend('email_failed', props.period),
      getStatsTrend('email_resent', props.period),
      getStatsTrend('ops_incidents', props.period),
    ])
    emailSentTrend.value = emailSent
    emailFailedTrend.value = emailFailed
    emailResentTrend.value = emailResent
    incidentsTrend.value = incidents
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
  }
}

watch(() => props.period, fetchData)
onMounted(fetchData)

const emailChartData = computed(() => {
  const dateSet = new Set<string>()
  for (const trend of [emailSentTrend.value, emailFailedTrend.value, emailResentTrend.value]) {
    for (const point of trend?.data_points ?? []) dateSet.add(point.date)
  }
  const dates = [...dateSet].sort()
  const toMap = (trend: TrendResponse | null) =>
    new Map((trend?.data_points ?? []).map((point) => [point.date, point.value]))
  const sent = toMap(emailSentTrend.value)
  const failed = toMap(emailFailedTrend.value)
  const resent = toMap(emailResentTrend.value)

  return {
    labels: dates,
    datasets: [
      {
        label: t('stats.emailSent'),
        data: dates.map((date) => sent.get(date) ?? 0),
        backgroundColor: '#18a058',
      },
      {
        label: t('stats.emailFailed'),
        data: dates.map((date) => failed.get(date) ?? 0),
        backgroundColor: '#d03050',
      },
      {
        label: t('stats.emailResent'),
        data: dates.map((date) => resent.get(date) ?? 0),
        backgroundColor: '#f0a020',
      },
    ],
  }
})

const incidentsData = computed(() => ({
  labels: incidentsTrend.value?.data_points.map((point) => point.date) ?? [],
  datasets: [
    {
      label: t('stats.opsIncidents'),
      data: incidentsTrend.value?.data_points.map((point) => point.value) ?? [],
      backgroundColor: 'rgba(208,48,80,0.7)',
    },
  ],
}))

const hasEmailData = computed(() => emailChartData.value.labels.length > 0)
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
          :title="t('stats.emailNotifications')"
          size="small"
        >
          <div class="chart-wrap">
            <Bar
              v-if="hasEmailData"
              :data="emailChartData"
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
          :title="t('stats.opsIncidents')"
          size="small"
        >
          <div class="chart-wrap">
            <Bar
              v-if="(incidentsTrend?.data_points.length ?? 0) > 0"
              :data="incidentsData"
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
