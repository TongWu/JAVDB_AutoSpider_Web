<script setup lang="ts">
import { computed, h } from 'vue'
import { useI18n } from 'vue-i18n'
import { NDataTable, NTag, type DataTableColumns } from 'naive-ui'
import StateBadge from './StateBadge.vue'
import type { SessionItem } from '@/api/sessions'

const props = defineProps<{
  items: SessionItem[]
  loading?: boolean
  highlightedSessionId?: string | null
}>()

const emit = defineEmits<{ selectRow: [session: SessionItem] }>()

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

function formatRun(row: SessionItem): string {
  if (!row.run_id) return '—'
  return row.run_attempt != null ? `${row.run_id}/${row.run_attempt}` : String(row.run_id)
}

const columns = computed<DataTableColumns<SessionItem>>(() => [
  {
    title: t('sessions.col.sessionId'),
    key: 'session_id',
    render: (row) =>
      h(
        'span',
        { style: 'font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px;' },
        row.session_id ?? '',
      ),
  },
  {
    title: t('sessions.col.state'),
    key: 'state',
    render: (row) => h(StateBadge, { state: row.state }),
  },
  {
    title: t('sessions.col.writeMode'),
    key: 'write_mode',
    render: (row) =>
      h(NTag, { size: 'small', round: true }, () => String(row.write_mode ?? '—')),
  },
  {
    title: t('sessions.col.run'),
    key: 'run_id',
    render: (row) => formatRun(row),
  },
  {
    title: t('sessions.col.created'),
    key: 'created_at',
    render: (row) => formatRelative(row.created_at),
  },
])

const rowProps = (row: SessionItem) => ({
  onClick: () => emit('selectRow', row),
  style: {
    cursor: 'pointer',
    background: row.session_id === props.highlightedSessionId ? 'var(--n-color-pressed)' : undefined,
  },
})
</script>

<template>
  <NDataTable
    :columns="columns"
    :data="props.items"
    :loading="props.loading"
    :row-props="rowProps"
    :row-key="(row: SessionItem) => row.session_id"
    striped
    flex-height
    style="min-height: 360px;"
  />
</template>
