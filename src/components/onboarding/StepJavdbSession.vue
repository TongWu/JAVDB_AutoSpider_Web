<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NTabs, NTabPane, NSpace, NButton, NInput,
  NAlert, useMessage,
} from 'naive-ui'
import { useOnboardingStore } from '@/stores/onboarding'
import { http } from '@/api/client'

const { t } = useI18n()
const ob = useOnboardingStore()
const message = useMessage()

const activeTab = ref<'cookie' | 'credentials'>('cookie')

// Cookie path
const cookie = ref<string>(ob.getStepValue<string>(2, 'cookie', ''))
const testingCookie = ref(false)

async function testCookie() {
  if (!cookie.value.trim()) {
    message.warning(t('onboarding.javdbSession.cookieRequired'))
    return
  }
  testingCookie.value = true
  try {
    ob.setStepValue(2, 'cookie', cookie.value.trim())
    await ob.runTest('javdb')
  } catch (err) {
    console.error(err)
  } finally {
    testingCookie.value = false
  }
}

// Credentials path
const username = ref<string>(ob.getStepValue<string>(2, 'cred_username', ''))
const password = ref<string>(ob.getStepValue<string>(2, 'cred_password', ''))
const loggingIn = ref(false)
const credentialsError = ref<string | null>(null)
const credentialsOk = ref(false)

async function signIn() {
  if (!username.value || !password.value) {
    message.warning(t('onboarding.javdbSession.credentialsRequired'))
    return
  }
  loggingIn.value = true
  credentialsError.value = null
  try {
    ob.setStepValue(2, 'cred_username', username.value)
    ob.setStepValue(2, 'cred_password', password.value)
    // POST /api/login/refresh — drives a fresh headless login on the BE
    const { data } = await http.post('/api/login/refresh', {
      username: username.value,
      password: password.value,
    })
    credentialsOk.value = !!(data?.ok ?? data?.success ?? data?.status === 'ok')
    if (!credentialsOk.value) {
      credentialsError.value = String(data?.message ?? t('onboarding.javdbSession.loginFailed'))
    }
  } catch (err) {
    credentialsOk.value = false
    credentialsError.value = err instanceof Error ? err.message : String(err)
  } finally {
    loggingIn.value = false
  }
}

const cookieTestResult = computed(() => ob.testResults.javdb)
const cookieTestOk = computed(() => cookieTestResult.value?.ok === true)
const anySuccess = computed(() => cookieTestOk.value || credentialsOk.value)

function back() { ob.setCurrentStep(1) }
function skip() { ob.setCurrentStep(3) }
function next() {
  if (!anySuccess.value) {
    message.warning(t('onboarding.javdbSession.notTestedYet'))
    return
  }
  ob.setCurrentStep(3)
}
</script>

<template>
  <div class="step-content">
    <h2>{{ t('onboarding.javdbSession.title') }}</h2>
    <p class="lead">{{ t('onboarding.javdbSession.body') }}</p>

    <NTabs v-model:value="activeTab" type="line" animated>
      <NTabPane name="cookie" :tab="t('onboarding.javdbSession.tabCookie')">
        <NSpace vertical size="large">
          <div>
            <label class="label">{{ t('onboarding.javdbSession.cookieLabel') }}</label>
            <NInput
              v-model:value="cookie"
              type="textarea"
              :placeholder="t('onboarding.javdbSession.cookiePlaceholder')"
              :rows="3"
            />
            <p class="hint">{{ t('onboarding.javdbSession.cookieHint') }}</p>
          </div>

          <NSpace>
            <NButton
              type="primary"
              :loading="testingCookie"
              :disabled="testingCookie || !cookie.trim()"
              @click="testCookie"
            >
              {{ t('onboarding.javdbSession.testButton') }}
            </NButton>
          </NSpace>

          <NAlert
            v-if="cookieTestResult"
            :type="cookieTestOk ? 'success' : 'error'"
            :title="cookieTestOk ? t('onboarding.javdbSession.testPassed') : t('onboarding.javdbSession.testFailed')"
          >
            {{ cookieTestResult.message }}
          </NAlert>
        </NSpace>
      </NTabPane>

      <NTabPane name="credentials" :tab="t('onboarding.javdbSession.tabCredentials')">
        <NSpace vertical size="large">
          <div>
            <label class="label">{{ t('login.username') }}</label>
            <NInput v-model:value="username" />
          </div>
          <div>
            <label class="label">{{ t('login.password') }}</label>
            <NInput v-model:value="password" type="password" show-password-on="click" />
          </div>

          <NSpace>
            <NButton
              type="primary"
              :loading="loggingIn"
              :disabled="loggingIn || !username || !password"
              @click="signIn"
            >
              {{ t('login.signIn') }}
            </NButton>
          </NSpace>

          <NAlert
            v-if="credentialsOk"
            type="success"
            :title="t('onboarding.javdbSession.loginPassed')"
          />
          <NAlert
            v-else-if="credentialsError"
            type="error"
            :title="t('onboarding.javdbSession.loginFailed')"
          >
            {{ credentialsError }}
          </NAlert>
        </NSpace>
      </NTabPane>
    </NTabs>

    <div class="actions">
      <NButton @click="back">{{ t('common.back') }}</NButton>
      <NSpace>
        <NButton text @click="skip">{{ t('common.skip') }}</NButton>
        <NButton type="primary" :disabled="!anySuccess" @click="next">
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
.actions { display: flex; justify-content: space-between; align-items: center; margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--n-divider-color, #eee); }
</style>
