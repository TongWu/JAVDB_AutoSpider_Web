<script setup lang="ts">
import { computed } from 'vue'
import { NSteps, NStep } from 'naive-ui'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ current: number }>()
const { t } = useI18n()

const labels = computed(() => [
  t('onboarding.steps.welcome'),
  t('onboarding.steps.javdb'),
  t('onboarding.steps.qbittorrent'),
  t('onboarding.steps.proxy'),
  t('onboarding.steps.firstRun'),
])
</script>

<template>
  <NSteps
    :current="props.current"
    size="small"
  >
    <NStep
      v-for="(label, idx) in labels"
      :key="idx"
      :title="label"
    />
  </NSteps>
</template>
