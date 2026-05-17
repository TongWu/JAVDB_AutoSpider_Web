<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { NCard } from 'naive-ui'
import { useOnboardingStore } from '@/stores/onboarding'
import WizardStepper from '@/components/onboarding/WizardStepper.vue'
import StepWelcome from '@/components/onboarding/StepWelcome.vue'

const { t } = useI18n()
const ob = useOnboardingStore()

onMounted(() => {
  if (!ob.status) {
    void ob.fetchStatus()
  }
})

const step = computed(() => ob.currentStep)
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
      <component
        :is="
          step === 1 ? StepWelcome :
          /* placeholder for steps 2..5 — real impl lands in Task C2-C4 */
          StepWelcome
        "
      />
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
