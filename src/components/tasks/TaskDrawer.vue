<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { NDrawer, NDrawerContent, NDescriptions, NDescriptionsItem, NDivider } from 'naive-ui'
import StatusBadge from './StatusBadge.vue'
import LogStreamView from '@/components/run/LogStreamView.vue'
import type { TaskItem } from '@/api/tasks'

const props = defineProps<{ show: boolean; task: TaskItem | null }>()
const emit = defineEmits<{ 'update:show': [val: boolean] }>()

const { t } = useI18n()
const visible = computed({
  get: () => props.show,
  set: (v: boolean) => emit('update:show', v),
})
</script>

<template>
  <NDrawer v-model:show="visible" :width="720" placement="right">
    <NDrawerContent
      v-if="props.task"
      :title="props.task.job_id ?? t('tasks.drawer.untitled')"
      :native-scrollbar="false"
    >
      <NDescriptions :column="2" size="small" label-placement="left">
        <NDescriptionsItem :label="t('tasks.col.jobId')">
          <code>{{ props.task.job_id }}</code>
        </NDescriptionsItem>
        <NDescriptionsItem :label="t('tasks.col.mode')">{{ props.task.mode ?? '—' }}</NDescriptionsItem>
        <NDescriptionsItem :label="t('tasks.col.status')">
          <StatusBadge :status="(props.task.status as string)" />
        </NDescriptionsItem>
        <NDescriptionsItem :label="t('tasks.col.started')">{{ props.task.started_at ?? '—' }}</NDescriptionsItem>
        <NDescriptionsItem v-if="props.task.ended_at" :label="t('tasks.col.ended')">{{ props.task.ended_at }}</NDescriptionsItem>
        <NDescriptionsItem :label="t('tasks.col.duration')">
          {{ props.task.duration_seconds != null ? `${props.task.duration_seconds}s` : '—' }}
        </NDescriptionsItem>
        <NDescriptionsItem v-if="props.task.session_id" :label="t('tasks.col.sessionId')">
          <code>{{ props.task.session_id }}</code>
        </NDescriptionsItem>
        <NDescriptionsItem v-if="props.task.error" :label="t('tasks.col.error')">
          <span class="error-text">{{ props.task.error }}</span>
        </NDescriptionsItem>
      </NDescriptions>

      <NDivider />

      <h4 style="margin: 0 0 12px;">{{ t('tasks.drawer.logs') }}</h4>
      <LogStreamView :job-id="props.task.job_id ?? ''" />
    </NDrawerContent>
  </NDrawer>
</template>

<style scoped>
.error-text { color: var(--n-color-error); }
</style>
