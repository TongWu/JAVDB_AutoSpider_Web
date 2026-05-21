<script setup lang="ts">
import { computed, h, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { NDataTable, NButton, NTag, NSpace, useMessage } from 'naive-ui'
import type { DataTableColumns } from 'naive-ui'
import { useAuthStore } from '@/stores/auth'
import { useBrowseStore, type MagnetRow } from '@/stores/browse'
import { extractErrorMessage } from '@/api/errors'
import { useIndexStatus } from '@/composables/useIndexStatus'
import D1StatusDot from './D1StatusDot.vue'

const props = defineProps<{
  magnets: MagnetRow[]
  category?: string | null
}>()

const { t } = useI18n()
const auth = useAuthStore()
const browse = useBrowseStore()
const message = useMessage()
const { observe, statuses } = useIndexStatus()

const isAdmin = computed(() => auth.role === 'admin')

// Each magnet maps to a status keyed by its href (when present). We register
// every visible row immediately — the table fits on one screen so there's no
// IntersectionObserver win here, and the composable already debounces.
watch(
  () => props.magnets,
  (rows) => {
    for (const row of rows) {
      const href = typeof row.href === 'string' ? row.href : ''
      if (href) observe(href)
    }
  },
  { immediate: true, deep: true },
)

function statusForRow(row: MagnetRow) {
  const href = typeof row.href === 'string' ? row.href : ''
  if (!href) return { status: 'unknown' as const }
  const s = statuses.value.get(href)
  return s ?? { status: 'unknown' as const }
}

async function onDownload(row: MagnetRow): Promise<void> {
  const magnet = (row.magnet ?? '').toString().trim()
  if (!magnet) {
    message.error(t('browse.resolve.magnet.noMagnet'))
    return
  }
  try {
    await browse.downloadMagnet(
      magnet,
      (row.title ?? '').toString(),
      props.category ?? null,
    )
    message.success(t('browse.resolve.magnet.downloaded'))
  } catch (err) {
    message.error(extractErrorMessage(err))
  }
}

const columns = computed<DataTableColumns<MagnetRow>>(() => {
  const cols: DataTableColumns<MagnetRow> = [
    {
      title: t('browse.resolve.magnet.col.title'),
      key: 'title',
      ellipsis: { tooltip: true },
      width: 320,
    },
    {
      title: t('browse.resolve.magnet.col.size'),
      key: 'size',
      width: 110,
      sorter: (a, b) => sizeToBytes(a.size) - sizeToBytes(b.size),
    },
    {
      title: t('browse.resolve.magnet.col.quality'),
      key: 'quality',
      width: 120,
      render: (row) =>
        row.quality
          ? h(NTag, { size: 'small', round: true, type: 'info' }, { default: () => String(row.quality) })
          : '—',
    },
    {
      title: t('browse.resolve.magnet.col.date'),
      key: 'date',
      width: 120,
    },
    {
      title: t('browse.resolve.magnet.col.status'),
      key: '_status',
      width: 80,
      render: (row) => {
        const s = statusForRow(row)
        return h(D1StatusDot, { status: s.status, meta: 'meta' in s ? s.meta : undefined })
      },
    },
  ]
  if (isAdmin.value) {
    cols.push({
      title: t('browse.resolve.magnet.col.action'),
      key: '_action',
      width: 140,
      render: (row) =>
        h(
          NButton,
          {
            size: 'small',
            type: 'primary',
            secondary: true,
            disabled: !row.magnet,
            onClick: () => onDownload(row),
          },
          { default: () => t('browse.resolve.magnet.download') },
        ),
    })
  }
  return cols
})

function sizeToBytes(raw: unknown): number {
  if (typeof raw !== 'string') return 0
  const m = raw.trim().match(/^([\d.]+)\s*(B|KB|MB|GB|TB)?$/i)
  if (!m) return 0
  const v = parseFloat(m[1])
  const unit = (m[2] ?? 'B').toUpperCase()
  const mult: Record<string, number> = {
    B: 1,
    KB: 1024,
    MB: 1024 * 1024,
    GB: 1024 ** 3,
    TB: 1024 ** 4,
  }
  return v * (mult[unit] ?? 1)
}
</script>

<template>
  <NSpace vertical>
    <p
      v-if="props.magnets.length === 0"
      class="empty"
    >
      {{ t('browse.resolve.magnet.empty') }}
    </p>
    <NDataTable
      v-else
      :columns="columns"
      :data="props.magnets"
      :bordered="false"
      :pagination="false"
      size="small"
      :row-key="(row: MagnetRow) => String(row.magnet ?? row.title ?? Math.random())"
    />
  </NSpace>
</template>

<style scoped>
.empty {
  color: var(--n-text-color-2);
  font-size: 13px;
  padding: 12px 0;
}
</style>
