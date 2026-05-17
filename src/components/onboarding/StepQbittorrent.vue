<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { NSpace, NButton, NInput, NCheckbox, NAlert, useMessage } from 'naive-ui'
import { useOnboardingStore } from '@/stores/onboarding'
import { http } from '@/api/client'
import { extractErrorMessage } from '@/api/errors'

const { t } = useI18n()
const ob = useOnboardingStore()
const message = useMessage()

/** Return empty string if the value is a mask placeholder (e.g. "***"). */
function unmask(val: unknown): string {
  if (typeof val !== 'string') return ''
  if (/^\*+$/.test(val.trim())) return ''
  return val
}

// Pre-populate from session-store first, fall back to config snapshot.
// QB_PASSWORD is sensitive — never prefill from server, but restore session-store value.
const qbUrl = ref<string>(
  ob.getStepValue<string>(3, 'qbUrl', '') ||
  unmask(ob.configSnapshot?.QB_URL),
)
const qbUsername = ref<string>(
  ob.getStepValue<string>(3, 'qbUsername', '') ||
  unmask(ob.configSnapshot?.QB_USERNAME),
)
const qbPassword = ref<string>(ob.getStepValue<string>(3, 'qbPassword', ''))
const allowSelfSigned = ref<boolean>(ob.getStepValue<boolean>(3, 'allowSelfSigned', false))
const testing = ref(false)
const testError = ref<string | null>(null)

async function runTest() {
  if (!qbUrl.value.trim()) {
    message.warning(t('onboarding.qbittorrent.urlRequired'))
    return
  }
  testing.value = true
  testError.value = null
  try {
    ob.setStepValue(3, 'qbUrl', qbUrl.value.trim())
    ob.setStepValue(3, 'qbUsername', qbUsername.value)
    ob.setStepValue(3, 'qbPassword', qbPassword.value)
    ob.setStepValue(3, 'allowSelfSigned', allowSelfSigned.value)
    // Persist to config.py before running the test
    await http.put(
      '/api/config',
      {
        QB_URL: qbUrl.value.trim(),
        QB_USERNAME: qbUsername.value,
        QB_PASSWORD: qbPassword.value,
      },
      { skipErrorToast: true },
    )
    await ob.runTest('qb')
  } catch (err) {
    testError.value = extractErrorMessage(err)
  } finally {
    testing.value = false
  }
}

const result = computed(() => ob.testResults.qb)
const testOk = computed(() => result.value?.ok === true)

function back() { ob.setCurrentStep(2) }
function skip() { ob.setCurrentStep(4) }
function next() {
  if (!testOk.value) {
    message.warning(t('onboarding.qbittorrent.notTestedYet'))
    return
  }
  ob.setCurrentStep(4)
}
</script>

<template>
  <div class="step-content">
    <h2>{{ t('onboarding.qbittorrent.title') }}</h2>
    <p class="lead">{{ t('onboarding.qbittorrent.body') }}</p>

    <NSpace vertical size="large">
      <div>
        <label class="label">{{ t('onboarding.qbittorrent.urlLabel') }}</label>
        <NInput v-model:value="qbUrl" :placeholder="t('onboarding.qbittorrent.urlPlaceholder')" />
        <p class="hint">{{ t('onboarding.qbittorrent.urlHint') }}</p>
      </div>

      <div class="row2">
        <div>
          <label class="label">{{ t('login.username') }}</label>
          <NInput v-model:value="qbUsername" />
        </div>
        <div>
          <label class="label">{{ t('login.password') }}</label>
          <NInput v-model:value="qbPassword" type="password" show-password-on="click" />
        </div>
      </div>

      <NCheckbox v-model:checked="allowSelfSigned">
        {{ t('onboarding.qbittorrent.allowSelfSigned') }}
      </NCheckbox>

      <NSpace>
        <NButton
          type="primary"
          :loading="testing"
          :disabled="testing || !qbUrl.trim()"
          @click="runTest"
        >
          {{ t('onboarding.qbittorrent.testButton') }}
        </NButton>
      </NSpace>

      <NAlert
        v-if="testError"
        type="error"
        :title="t('onboarding.qbittorrent.testFailed')"
      >
        {{ testError }}
      </NAlert>

      <NAlert
        v-else-if="result"
        :type="testOk ? 'success' : 'error'"
        :title="testOk ? t('onboarding.qbittorrent.testPassed') : t('onboarding.qbittorrent.testFailed')"
      >
        {{ result.message }}
      </NAlert>
    </NSpace>

    <div class="actions">
      <NButton @click="back">{{ t('common.back') }}</NButton>
      <NSpace>
        <NButton tertiary @click="skip">{{ t('common.skip') }}</NButton>
        <NButton type="primary" :disabled="!testOk" @click="next">
          {{ t('common.continue') }}
        </NButton>
      </NSpace>
    </div>
  </div>
</template>

<style scoped>
.step-content { display: flex; flex-direction: column; gap: 16px; }
.step-content h2 { font-size: 20px; font-weight: 700; margin: 0; letter-spacing: -0.02em; }
.lead { color: var(--n-text-color-2); font-size: 13px; line-height: 1.6; margin: 0; }
.label { display: block; font-size: 12px; font-weight: 600; color: var(--n-text-color); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.05em; }
.hint { font-size: 11px; color: var(--n-text-color-disabled); margin: 6px 0 0; }
.row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.actions { display: flex; justify-content: space-between; align-items: center; margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--n-divider-color, #eee); }
</style>
