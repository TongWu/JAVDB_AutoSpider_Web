<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { NButton, NSpace } from 'naive-ui'
import { useOnboardingStore } from '@/stores/onboarding'

const router = useRouter()
const { t } = useI18n()
const ob = useOnboardingStore()

function configureNow() {
  ob.setCurrentStep(2)
}

function later() {
  void router.replace('/')
}
</script>

<template>
  <div class="welcome">
    <h2>{{ t('onboarding.welcome.title') }}</h2>
    <p class="lead">{{ t('onboarding.welcome.body') }}</p>

    <pre class="pipeline">{{ t('onboarding.welcome.pipeline') }}</pre>

    <ul class="bullets">
      <li>{{ t('onboarding.welcome.bullet1') }}</li>
      <li>{{ t('onboarding.welcome.bullet2') }}</li>
      <li>{{ t('onboarding.welcome.bullet3') }}</li>
    </ul>

    <NSpace>
      <NButton type="primary" size="large" @click="configureNow">
        {{ t('onboarding.welcome.configureNow') }}
      </NButton>
      <NButton size="large" @click="later">
        {{ t('onboarding.welcome.later') }}
      </NButton>
    </NSpace>
  </div>
</template>

<style scoped>
.welcome { display: flex; flex-direction: column; gap: 16px; }
.welcome h2 { font-size: 22px; font-weight: 700; margin: 0; letter-spacing: -0.02em; }
.lead { color: var(--n-text-color-2); font-size: 14px; line-height: 1.6; margin: 0; }
.pipeline {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  line-height: 1.5;
  background: var(--n-action-color, #f5f3ef);
  padding: 16px;
  border-radius: 10px;
  margin: 0;
  white-space: pre;
  overflow-x: auto;
}
.bullets { margin: 0; padding-left: 20px; color: var(--n-text-color-2); font-size: 13px; line-height: 1.7; }
</style>
