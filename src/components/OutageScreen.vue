<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { NCard, NButton, NSpace } from 'naive-ui'
import { useI18n } from 'vue-i18n'

const emit = defineEmits<{ retry: [] }>()
const { t } = useI18n()
const baseURL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8100'

const countdown = ref(5)
let intervalId: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  intervalId = setInterval(() => {
    countdown.value -= 1
    if (countdown.value <= 0) {
      countdown.value = 5
      emit('retry')
    }
  }, 1000)
})

onBeforeUnmount(() => {
  if (intervalId) clearInterval(intervalId)
})

function handleRetry() {
  countdown.value = 5
  emit('retry')
}
</script>

<template>
  <div class="outage-wrap">
    <NCard
      :title="t('errors.outage.title')"
      style="max-width: 560px;"
    >
      <p>{{ t('errors.outage.body') }}</p>
      <p style="color: var(--n-text-color-disabled); font-size: 12px;">
        VITE_API_BASE_URL: <code>{{ baseURL }}</code>
      </p>
      <p>{{ t('errors.outage.checklist') }}</p>
      <ul>
        <li>{{ t('errors.outage.checkBackend') }}</li>
        <li>{{ t('errors.outage.checkUrl') }}</li>
        <li>{{ t('errors.outage.checkCors') }}</li>
      </ul>
      <NSpace justify="end">
        <NButton
          type="primary"
          @click="handleRetry"
        >
          {{ t('errors.outage.retry') }} ({{ countdown }}s)
        </NButton>
      </NSpace>
    </NCard>
  </div>
</template>

<style scoped>
.outage-wrap {
  display: flex;
  min-height: 100vh;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--n-body-color, #faf9f7);
}
</style>
