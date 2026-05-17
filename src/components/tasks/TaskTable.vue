<script setup lang="ts">
import { computed, h } from 'vue'
import { useI18n } from 'vue-i18n'
import { NDataTable, NTag, type DataTableColumns } from 'naive-ui'
import StatusBadge from './StatusBadge.vue'
import type { TaskItem } from '@/api/tasks'

const props = defineProps<{
  items: TaskItem[]
  loading?: boolean
  highlightedJobId?: string | null
}>()

const emit = defineEmits<{ selectRow: [task: TaskItem] }>()

const { t } = useI18n()

function formatRelative(ts?: string): string {
  if (!ts) return ''
  const d = new Date(ts).getTime()
  if (isNaN(d)) return ts
  const diff = Date.now() - d
  if (diff < 60_000) return `${Math.max(1, Math.floor(diff / 1000))}s ago`
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return new Date(ts).toLocaleString()
}

function formatDuration(seconds?: number | null): string {
  if (seconds == null) return '—'
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}m ${s}s`
}

const columns = computed<DataTableColumns<TaskItem>>(() => [
  {
    title: t('tasks.col.jobId'),
    key: 'job_id',
    render: (row) => h('span', { style: 'font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px;' }, row.job_id ?? ''),
  },
  {
    title: t('tasks.col.mode'),
    key: 'mode',
    render: (row) => h(NTag, { size: 'small', round: true }, () => String(row.mode ?? '—')),
  },
  {
    title: t('tasks.col.status'),
    key: 'status',
    render: (row) => h(StatusBadge, { status: row.status as string | undefined }),
  },
  {
    title: t('tasks.col.started'),
    key: 'started_at',
    render: (row) => formatRelative(row.started_at as string | undefined),
  },
  {
    title: t('tasks.col.duration'),
    key: 'duration_seconds',
    render: (row) => formatDuration(row.duration_seconds as number | null | undefined),
  },
])

const rowProps = (row: TaskItem) => ({
  onClick: () => emit('selectRow', row),
  style: {
    cursor: 'pointer',
    background: row.job_id === props.highlightedJobId ? 'var(--n-color-pressed)' : undefined,
  },
})
</script>

<template>
  <NDataTable
    :columns="columns"
    :data="props.items"
    :loading="props.loading"
    :row-props="rowProps"
    :row-key="(row: TaskItem) => row.job_id"
    striped
    flex-height
    style="min-height: 360px"
  />
</template>
