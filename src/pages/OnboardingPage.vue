<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { NCard } from 'naive-ui'
import { useOnboardingStore } from '@/stores/onboarding'
import WizardStepper from '@/components/onboarding/WizardStepper.vue'

const StepWelcome = defineAsyncComponent(() => import('@/components/onboarding/StepWelcome.vue'))
const StepJavdbSession = defineAsyncComponent(() => import('@/components/onboarding/StepJavdbSession.vue'))
const StepQbittorrent = defineAsyncComponent(() => import('@/components/onboarding/StepQbittorrent.vue'))
const StepProxy = defineAsyncComponent(() => import('@/components/onboarding/StepProxy.vue'))
const StepFirstRun = defineAsyncComponent(() => import('@/components/onboarding/StepFirstRun.vue'))

const { t } = useI18n()
const ob = useOnboardingStore()

onMounted(() => {
  if (!ob.status) {
    void ob.fetchStatus()
  }
  // Pre-load runtime config once so step components can populate defaults
  void ob.fetchConfigSnapshot()
})

const step = computed(() => ob.currentStep)
const StepComponent = computed(() => {
  switch (step.value) {
    case 1: return StepWelcome
    case 2: return StepJavdbSession
    case 3: return StepQbittorrent
    case 4: return StepProxy
    case 5: return StepFirstRun
    default: return StepWelcome
  }
})
</script>

<template>
  <div class="onboarding-shell">
    <header class="brand">
      <div class="brand-mark" />
      <div class="brand-name">
        {{ t('app.name') }}
      </div>
    </header>

    <WizardStepper :current="step" />

    <NCard class="step-card">
      <component :is="StepComponent" />
    </NCard>

    <footer class="footer">
      {{ t('onboarding.footer', { current: step, total: 5 }) }}
    </footer>
  </div>
</template>

<style scoped>
.onboarding-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 32px 24px;
  background: var(--n-body-color, #faf9f7);
  gap: 24px;
}
.brand { display: flex; align-items: center; gap: 8px; }
.brand-mark { width: 28px; height: 28px; background: linear-gradient(135deg, #7c3aed, #ec4899); border-radius: 8px; }
.brand-name { font-weight: 700; font-size: 15px; }
.step-card { width: 100%; max-width: 720px; }
.footer { font-size: 12px; color: var(--n-text-color-disabled); }
</style>
