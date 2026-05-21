<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { NSpace, NButton, NCard, NAlert, useMessage } from 'naive-ui'
import { useOnboardingStore } from '@/stores/onboarding'
import { apiTriggerDaily } from '@/api/tasks'
import { extractErrorMessage } from '@/api/errors'

const router = useRouter()
const { t } = useI18n()
const message = useMessage()
const ob = useOnboardingStore()

const runningTest = ref(false)
const completing = ref(false)
const errorMsg = ref<string | null>(null)

async function runTestDaily() {
  runningTest.value = true
  errorMsg.value = null
  try {
    const resp = await apiTriggerDaily({ start_page: 1, end_page: 3 })
    const jobId = resp?.job_id
    await ob.completeOnboarding()
    if (jobId) {
      void router.replace({ path: '/tasks', query: { highlight: jobId } })
    } else {
      void router.replace('/tasks')
    }
  } catch (err) {
    errorMsg.value = extractErrorMessage(err)
    message.error(t('onboarding.firstRun.runFailed'))
    runningTest.value = false
  }
}

async function skipAndExplore() {
  completing.value = true
  errorMsg.value = null
  try {
    await ob.completeOnboarding()
    void router.replace('/')
  } catch (err) {
    errorMsg.value = extractErrorMessage(err)
    message.error(t('onboarding.firstRun.completeFailed'))
    completing.value = false
  }
}

function back() {
  ob.setCurrentStep(4)
}
</script>

<template>
  <div class="step-content">
    <h2>{{ t('onboarding.firstRun.title') }}</h2>
    <p class="lead">
      {{ t('onboarding.firstRun.body') }}
    </p>

    <NSpace
      vertical
      size="large"
    >
      <NCard
        size="small"
        class="option-card"
      >
        <h3>{{ t('onboarding.firstRun.runNowTitle') }}</h3>
        <p class="card-body">
          {{ t('onboarding.firstRun.runNowBody') }}
        </p>
        <NButton
          type="primary"
          size="large"
          :loading="runningTest"
          :disabled="runningTest || completing"
          @click="runTestDaily"
        >
          {{ t('onboarding.firstRun.runNowButton') }}
        </NButton>
      </NCard>

      <NCard
        size="small"
        class="option-card"
      >
        <h3>{{ t('onboarding.firstRun.skipTitle') }}</h3>
        <p class="card-body">
          {{ t('onboarding.firstRun.skipBody') }}
        </p>
        <NButton
          size="large"
          :loading="completing"
          :disabled="runningTest || completing"
          @click="skipAndExplore"
        >
          {{ t('onboarding.firstRun.skipButton') }}
        </NButton>
      </NCard>

      <NAlert
        v-if="errorMsg"
        type="error"
        :title="t('errors.generic.title')"
      >
        {{ errorMsg }}
      </NAlert>
    </NSpace>

    <div class="actions">
      <NButton
        :disabled="runningTest || completing"
        @click="back"
      >
        {{ t('common.back') }}
      </NButton>
    </div>
  </div>
</template>

<style scoped>
.step-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.step-content h2 {
  font-size: 20px;
  font-weight: 700;
  margin: 0;
  letter-spacing: -0.02em;
}
.lead {
  color: var(--n-text-color-2);
  font-size: 13px;
  line-height: 1.6;
  margin: 0;
}
.option-card h3 {
  font-size: 15px;
  font-weight: 600;
  margin: 0 0 8px;
}
.card-body {
  color: var(--n-text-color-2);
  font-size: 13px;
  margin: 0 0 12px;
  line-height: 1.5;
}
.actions {
  display: flex;
  justify-content: flex-start;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--n-divider-color, #eee);
}
</style>
