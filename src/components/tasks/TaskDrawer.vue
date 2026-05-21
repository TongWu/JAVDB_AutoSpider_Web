<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { NDrawer, NDrawerContent, NDescriptions, NDescriptionsItem, NDivider, NTag, NSpace } from 'naive-ui'
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

const startedAt = computed(() => props.task?.started_at || (props.task?.created_at as string) || '')
const endedAt = computed(() => props.task?.ended_at || (props.task?.completed_at as string) || '')
const duration = computed(() => props.task?.duration_seconds as number | null | undefined)
const taskUrl = computed(() => (props.task?.url as string) || '')
const taskKind = computed(() => (props.task?.kind as string) || '')
const params = computed(() => (props.task?.params as Record<string, unknown>) || {})

function formatTimestamp(ts: string): string {
  if (!ts) return '—'
  try {
    return new Date(ts).toLocaleString()
  } catch {
    return ts
  }
}

function formatDuration(seconds?: number | null): string {
  if (seconds == null) return '—'
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}m ${s}s`
}

const paramTags = computed(() => {
  const p = params.value
  const tags: { label: string; value: string; type?: 'info' | 'warning' | 'success' | 'error' }[] = []
  if (p.dry_run) tags.push({ label: t('tasks.param.dryRun'), value: '✓', type: 'warning' })
  if (p.start_page != null || p.end_page != null) {
    tags.push({ label: t('tasks.param.pages'), value: `${p.start_page ?? 1} – ${p.end_page ?? '∞'}` })
  }
  if (p.phase && p.phase !== 'all') tags.push({ label: t('tasks.param.phase'), value: String(p.phase) })
  if (p.use_proxy) tags.push({ label: t('tasks.param.proxy'), value: 'on', type: 'info' })
  if (p.no_proxy) tags.push({ label: t('tasks.param.proxy'), value: 'off' })
  if (p.ignore_release_date) tags.push({ label: t('tasks.param.ignoreDate'), value: '✓' })
  if (p.ignore_history) tags.push({ label: t('tasks.param.ignoreHistory'), value: '✓' })
  if (p.pikpak_individual) tags.push({ label: 'PikPak', value: 'individual' })
  return tags
})
</script>

<template>
  <NDrawer
    v-model:show="visible"
    :width="720"
    placement="right"
  >
    <NDrawerContent
      v-if="props.task"
      :title="props.task.job_id ?? t('tasks.drawer.untitled')"
      :native-scrollbar="false"
    >
      <NDescriptions
        :column="2"
        size="small"
        label-placement="left"
      >
        <NDescriptionsItem :label="t('tasks.col.jobId')">
          <code>{{ props.task.job_id }}</code>
        </NDescriptionsItem>
        <NDescriptionsItem :label="t('tasks.col.kind')">
          <NTag
            size="small"
            round
          >
            {{ taskKind || '—' }}
          </NTag>
        </NDescriptionsItem>
        <NDescriptionsItem :label="t('tasks.col.mode')">
          {{ props.task.mode ?? '—' }}
        </NDescriptionsItem>
        <NDescriptionsItem :label="t('tasks.col.status')">
          <StatusBadge :status="(props.task.status as string)" />
        </NDescriptionsItem>
        <NDescriptionsItem
          v-if="taskUrl"
          :label="t('tasks.col.url')"
          :span="2"
        >
          <code style="font-size: 12px; word-break: break-all;">{{ taskUrl }}</code>
        </NDescriptionsItem>
        <NDescriptionsItem :label="t('tasks.col.started')">
          {{ formatTimestamp(startedAt) }}
        </NDescriptionsItem>
        <NDescriptionsItem
          v-if="endedAt"
          :label="t('tasks.col.ended')"
        >
          {{ formatTimestamp(endedAt) }}
        </NDescriptionsItem>
        <NDescriptionsItem :label="t('tasks.col.duration')">
          {{ formatDuration(duration) }}
        </NDescriptionsItem>
        <NDescriptionsItem
          v-if="props.task.session_id"
          :label="t('tasks.col.sessionId')"
        >
          <code>{{ props.task.session_id }}</code>
        </NDescriptionsItem>
        <NDescriptionsItem
          v-if="props.task.error"
          :label="t('tasks.col.error')"
        >
          <span class="error-text">{{ props.task.error }}</span>
        </NDescriptionsItem>
      </NDescriptions>

      <NSpace
        v-if="paramTags.length > 0"
        :size="6"
        style="margin-top: 12px;"
      >
        <NTag
          v-for="tag in paramTags"
          :key="tag.label"
          :type="tag.type"
          size="small"
          round
        >
          {{ tag.label }}: {{ tag.value }}
        </NTag>
      </NSpace>

      <NDivider />

      <h4 style="margin: 0 0 12px;">
        {{ t('tasks.drawer.logs') }}
      </h4>
      <LogStreamView :job-id="props.task.job_id ?? ''" />
    </NDrawerContent>
  </NDrawer>
</template>

<style scoped>
.error-text { color: var(--n-color-error); }
</style>
