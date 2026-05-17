<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { NCard, NGrid, NGi, NStatistic, NDataTable, NButton, NSpace, NTag } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import { useCapabilitiesStore } from '@/stores/capabilities'
import { useOnboardingStore } from '@/stores/onboarding'
import HintCard from '@/components/HintCard.vue'
import { http } from '@/api/client'

const { t } = useI18n()
const cap = useCapabilitiesStore()
const ob = useOnboardingStore()

const buildVersion = computed(() => cap.data?.build?.backend_version ?? '—')
const gitSha = computed(() => cap.data?.build?.git_sha ?? '—')

const dismissedHints = ref<string[]>([])

async function loadDismissed() {
  try {
    const { data } = await http.get<{ key: string; value: string | null }>('/api/system/state', {
      params: { key: 'dismissed_hints' },
    })
    if (data?.value) {
      try {
        dismissedHints.value = JSON.parse(data.value) as string[]
      } catch {
        dismissedHints.value = []
      }
    }
  } catch (err) {
    console.warn('Failed to load dismissed hints:', err)
  }
}

async function onDismiss(hintId: string) {
  try {
    await ob.dismissHint(hintId)
    dismissedHints.value = [...dismissedHints.value, hintId]
  } catch (err) {
    console.error('Dismiss hint failed:', err)
  }
}

const hintsToShow = computed(() => {
  const skippable = ob.status?.skippable_missing ?? []
  return skippable
    .filter((id) => !dismissedHints.value.includes(id))
    .map((id) => ({
      id,
      title: t(`home.hints.${id}.title`),
      body: t(`home.hints.${id}.body`),
    }))
})

onMounted(() => {
  if (!ob.status) void ob.fetchStatus()
  void loadDismissed()
})

const recentRunsColumns = [
  { title: 'Run', key: 'id' },
  { title: 'Mode', key: 'mode' },
  { title: 'Status', key: 'status' },
  { title: 'Duration', key: 'duration' },
]
const recentRunsData: Array<Record<string, unknown>> = []
</script>

<template>
  <div class="home">
    <header class="home-header">
      <div>
        <h1>{{ t('home.greeting') }}</h1>
        <p class="subtitle">
          <NTag round size="small" type="success">healthy</NTag>
          backend {{ buildVersion }} · {{ gitSha }}
        </p>
      </div>
      <NButton type="primary" disabled>{{ t('home.runDaily') }}</NButton>
    </header>

    <div v-if="hintsToShow.length > 0" class="hints">
      <HintCard
        v-for="hint in hintsToShow"
        :key="hint.id"
        :hint-id="hint.id"
        :title="hint.title"
        :body="hint.body"
        @dismiss="onDismiss"
      />
    </div>

    <NGrid :cols="4" :x-gap="16" :y-gap="16" style="margin-top: 24px">
      <NGi>
        <NCard><NStatistic :label="t('home.stat.running')" :value="0" /></NCard>
      </NGi>
      <NGi>
        <NCard><NStatistic :label="t('home.stat.today')" :value="0" /></NCard>
      </NGi>
      <NGi>
        <NCard><NStatistic :label="t('home.stat.failed')" :value="0" /></NCard>
      </NGi>
      <NGi>
        <NCard><NStatistic :label="t('home.stat.pending')" :value="0" /></NCard>
      </NGi>
    </NGrid>

    <NCard :title="t('home.recentRuns')" style="margin-top: 24px">
      <NDataTable :columns="recentRunsColumns" :data="recentRunsData" />
      <NSpace v-if="recentRunsData.length === 0" justify="center" style="padding: 24px">
        <span style="color: var(--n-text-color-disabled)">{{ t('home.noRunsYet') }}</span>
      </NSpace>
    </NCard>
  </div>
</template>

<style scoped>
.home {
  padding: 0;
}
.home-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.home-header h1 {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.subtitle {
  color: var(--n-text-color-2);
  font-size: 13px;
  margin-top: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.hints {
  margin-top: 24px;
}
</style>
