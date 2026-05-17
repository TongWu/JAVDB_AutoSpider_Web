<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { NCard, NButton, NTag } from 'naive-ui'
import { useRunsStore } from '@/stores/runs'
import LogStreamView from './LogStreamView.vue'

const props = defineProps<{
  jobId: string
  mode: 'daily' | 'adhoc' | 'spider'
}>()

const emit = defineEmits<{ reset: [] }>()

const { t } = useI18n()
const runs = useRunsStore()

const stream = computed(() => runs.getStream(props.jobId))
const elapsedSec = computed(() => {
  const s = stream.value
  if (!s) return 0
  return Math.floor((Date.now() - s.startedAt) / 1000)
})
</script>

<template>
  <NCard class="run-card">
    <template #header>
      <div class="header">
        <div>
          <div class="job-id">{{ props.jobId }}</div>
          <div class="meta">
            <NTag size="small" round>{{ t(`run.mode.${props.mode}`) }}</NTag>
            <NTag v-if="stream" size="small" round :type="stream.done ? 'success' : 'info'">
              {{ stream.status || 'pending' }}
            </NTag>
            <span class="elapsed">{{ Math.floor(elapsedSec / 60) }}m {{ elapsedSec % 60 }}s</span>
          </div>
        </div>
        <NButton size="small" @click="emit('reset')">{{ t('run.startAnother') }}</NButton>
      </div>
    </template>

    <LogStreamView :job-id="props.jobId" />
  </NCard>
</template>

<style scoped>
.header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
.job-id { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; font-weight: 600; }
.meta { display: flex; align-items: center; gap: 8px; margin-top: 4px; font-size: 12px; color: var(--n-text-color-2); }
.elapsed { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.run-card { margin-top: 16px; }
</style>
