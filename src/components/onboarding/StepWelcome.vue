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
  <NSpace
    vertical
    size="large"
  >
    <h2>{{ t('onboarding.welcome.title') }}</h2>
    <p>{{ t('onboarding.welcome.body') }}</p>
    <NSpace>
      <NButton
        type="primary"
        @click="configureNow"
      >
        {{ t('onboarding.welcome.configureNow') }}
      </NButton>
      <NButton @click="later">
        {{ t('onboarding.welcome.later') }}
      </NButton>
    </NSpace>
  </NSpace>
</template>
