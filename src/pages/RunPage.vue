<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { NTabs, NTabPane, NCard, NAlert, useMessage } from 'naive-ui'
import RunForm, { type RunFormSubmitPayload, type RunMode } from '@/components/run/RunForm.vue'
import RunCard from '@/components/run/RunCard.vue'
import { useRunsStore } from '@/stores/runs'
import { apiTriggerDaily, apiTriggerAdhoc } from '@/api/tasks'
import { apiSubmitSpiderJob } from '@/api/jobs'

const { t } = useI18n()
const message = useMessage()
const runs = useRunsStore()

const activeTab = ref<RunMode>('daily')
const activeJobs = ref<Record<RunMode, { jobId: string; usedAdvanced: boolean } | null>>({
  daily: null,
  adhoc: null,
})
const errorMsg = ref<string | null>(null)

async function onSubmit(mode: RunMode, payload: RunFormSubmitPayload) {
  errorMsg.value = null
  try {
    let jobId: string | undefined

    if (payload.useAdvanced) {
      const resp = await apiSubmitSpiderJob({
        url: payload.url,
        phase: payload.phase,
        use_proxy: payload.useProxy,
        ignore_history: payload.ignoreHistory,
        ignore_release_date: payload.ignoreReleaseDate,
        max_movies_phase1: payload.maxMoviesPhase1,
        max_movies_phase2: payload.maxMoviesPhase2,
        enable_dedup: payload.enableDedup,
        redownload_threshold: payload.redownloadThreshold,
        no_rclone_filter: payload.noRcloneFilter,
        disable_all_filters: payload.disableAllFilters,
        dry_run: payload.dryRun,
      })
      jobId = resp.job_id
    } else if (mode === 'daily') {
      const resp = await apiTriggerDaily({
        start_page: payload.startPage,
        end_page: payload.endPage,
        use_proxy: payload.useProxy,
        dry_run: payload.dryRun,
      })
      jobId = resp.job_id
    } else {
      const resp = await apiTriggerAdhoc({
        url: payload.url!,
        use_proxy: payload.useProxy,
        dry_run: payload.dryRun,
        ignore_release_date: payload.ignoreReleaseDate ?? false,
      })
      jobId = resp.job_id
    }

    if (!jobId) {
      message.error(t('run.noJobIdInResponse'))
      return
    }

    runs.startStream(jobId)
    activeJobs.value = { ...activeJobs.value, [mode]: { jobId, usedAdvanced: payload.useAdvanced } }
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : String(err)
    message.error(t('run.submitFailed'))
  }
}

function resetTab(mode: RunMode) {
  const active = activeJobs.value[mode]
  if (active) {
    // Don't remove the stream — Tasks page may want to reference it
    activeJobs.value = { ...activeJobs.value, [mode]: null }
  }
}
</script>

<template>
  <div class="run-page">
    <header class="page-header">
      <h1>{{ t('nav.run') }}</h1>
      <p class="subtitle">{{ t('run.subtitle') }}</p>
    </header>

    <NTabs v-model:value="activeTab" type="line" animated>
      <NTabPane name="daily" :tab="t('run.tabs.daily')">
        <NCard>
          <RunForm
            v-if="!activeJobs.daily"
            mode="daily"
            @submit="(p) => onSubmit('daily', p)"
          />
          <RunCard
            v-else
            :job-id="activeJobs.daily!.jobId"
            :mode="activeJobs.daily!.usedAdvanced ? 'spider' : 'daily'"
            @reset="resetTab('daily')"
          />
        </NCard>
      </NTabPane>

      <NTabPane name="adhoc" :tab="t('run.tabs.adhoc')">
        <NCard>
          <RunForm
            v-if="!activeJobs.adhoc"
            mode="adhoc"
            @submit="(p) => onSubmit('adhoc', p)"
          />
          <RunCard
            v-else
            :job-id="activeJobs.adhoc!.jobId"
            :mode="activeJobs.adhoc!.usedAdvanced ? 'spider' : 'adhoc'"
            @reset="resetTab('adhoc')"
          />
        </NCard>
      </NTabPane>
    </NTabs>

    <NAlert v-if="errorMsg" type="error" :title="t('errors.generic.title')" closable @close="errorMsg = null">
      {{ errorMsg }}
    </NAlert>
  </div>
</template>

<style scoped>
.run-page { display: flex; flex-direction: column; gap: 16px; }
.page-header h1 { margin: 0; font-size: 22px; font-weight: 700; }
.subtitle { color: var(--n-text-color-2); font-size: 13px; margin-top: 4px; }
</style>
