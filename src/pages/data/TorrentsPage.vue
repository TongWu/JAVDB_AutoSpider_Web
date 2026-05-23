<script setup lang="ts">
import { computed, h, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NCard,
  NAlert,
  NMessageProvider,
  NDataTable,
  NInput,
  NTag,
  NButton,
  NSwitch,
  NDatePicker,
  NSelect,
  NSpace,
  NTooltip,
  type DataTableColumns,
} from 'naive-ui'
import {
  searchTorrents,
  exportTorrentsCsv,
  type TorrentSearchItem,
  type TorrentSearchParams,
} from '@/api/history'

const { t } = useI18n()

// ---------- State ----------
const items = ref<TorrentSearchItem[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const nextCursor = ref<string | null>(null)
const totalEstimate = ref(0)
const loadingMore = ref(false)
const exporting = ref(false)

// Filters
const searchQuery = ref('')
const resolutionFilter = ref<number | null>(null)
const subtitleFilter = ref<boolean | null>(null)
const uncensoredFilter = ref<boolean | null>(null)
const sessionIdFilter = ref('')
const dateRange = ref<[number, number] | null>(null)

// Debounce
let debounceTimer: ReturnType<typeof setTimeout> | null = null

const resolutionOptions = computed(() => [
  { label: t('torrents.resolution.unknown'), value: 0 },
  { label: t('torrents.resolution.sd'), value: 1 },
  { label: t('torrents.resolution.hd'), value: 2 },
  { label: t('torrents.resolution.fhd'), value: 3 },
  { label: t('torrents.resolution.4k'), value: 4 },
])

function toLocalYmd(ts: number): string {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function buildFilterParams(): TorrentSearchParams {
  const params: TorrentSearchParams = {}
  if (searchQuery.value) params.q = searchQuery.value
  if (resolutionFilter.value != null) params.resolution_type = resolutionFilter.value
  if (subtitleFilter.value != null) params.has_subtitle = subtitleFilter.value
  if (uncensoredFilter.value != null) params.uncensored = uncensoredFilter.value
  if (sessionIdFilter.value) params.session_id = sessionIdFilter.value
  if (dateRange.value) {
    params.date_from = toLocalYmd(dateRange.value[0])
    params.date_to = toLocalYmd(dateRange.value[1])
  }
  return params
}

function buildParams(cursor?: string): TorrentSearchParams {
  const params: TorrentSearchParams = { ...buildFilterParams(), limit: 50 }
  if (cursor) params.cursor = cursor
  return params
}

async function fetchTorrents() {
  loading.value = true
  error.value = null
  try {
    const res = await searchTorrents(buildParams())
    items.value = res.items
    nextCursor.value = res.next_cursor ?? null
    totalEstimate.value = res.total_estimate
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

async function loadMore() {
  if (!nextCursor.value) return
  loadingMore.value = true
  try {
    const res = await searchTorrents(buildParams(nextCursor.value))
    items.value = [...items.value, ...res.items]
    nextCursor.value = res.next_cursor ?? null
    totalEstimate.value = res.total_estimate
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loadingMore.value = false
  }
}

async function handleExport() {
  exporting.value = true
  try {
    const blob = await exportTorrentsCsv(buildFilterParams())
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'torrents.csv'
    a.click()
    URL.revokeObjectURL(url)
  } catch {
    error.value = t('torrents.exportFailed')
  } finally {
    exporting.value = false
  }
}

function resetFilters() {
  searchQuery.value = ''
  resolutionFilter.value = null
  subtitleFilter.value = null
  uncensoredFilter.value = null
  sessionIdFilter.value = ''
  dateRange.value = null
}

function debouncedFetch() {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => fetchTorrents(), 300)
}

// Watch all filter changes
watch(
  [searchQuery, resolutionFilter, subtitleFilter, uncensoredFilter, sessionIdFilter, dateRange],
  () => debouncedFetch(),
)

onMounted(() => fetchTorrents())
onUnmounted(() => { if (debounceTimer) clearTimeout(debounceTimer) })

// ---------- Table ----------

function formatRelative(ts?: string | null): string {
  if (!ts) return ''
  const d = new Date(ts).getTime()
  if (isNaN(d)) return ts
  const diff = Date.now() - d
  if (diff < 60_000) return t('common.time.secondsAgo', { n: Math.max(1, Math.floor(diff / 1000)) })
  if (diff < 3_600_000) return t('common.time.minutesAgo', { n: Math.floor(diff / 60_000) })
  if (diff < 86_400_000) return t('common.time.hoursAgo', { n: Math.floor(diff / 3_600_000) })
  return new Date(ts).toLocaleString()
}

function resolutionLabel(val: number): string {
  const map: Record<number, string> = {
    0: t('torrents.resolution.unknown'),
    1: t('torrents.resolution.sd'),
    2: t('torrents.resolution.hd'),
    3: t('torrents.resolution.fhd'),
    4: t('torrents.resolution.4k'),
  }
  return map[val] ?? String(val)
}

function resolutionTagType(val: number): 'default' | 'info' | 'success' | 'warning' {
  const map: Record<number, 'default' | 'info' | 'success' | 'warning'> = {
    0: 'default',
    1: 'default',
    2: 'info',
    3: 'success',
    4: 'warning',
  }
  return map[val] ?? 'default'
}

function truncateMagnet(uri?: string | null): string {
  if (!uri) return ''
  return uri.length > 40 ? uri.slice(0, 40) + '...' : uri
}

const columns = computed<DataTableColumns<TorrentSearchItem>>(() => [
  {
    title: t('torrents.col.videoCode'),
    key: 'movie_video_code',
    render: (row) =>
      h(
        'span',
        { style: 'font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px;' },
        row.movie_video_code ?? '—',
      ),
  },
  {
    title: t('torrents.col.magnet'),
    key: 'magnet_uri',
    render: (row) => {
      const truncated = truncateMagnet(row.magnet_uri)
      if (!truncated) return '—'
      if (row.magnet_uri && row.magnet_uri.length > 40) {
        return h(
          NTooltip,
          { trigger: 'hover' },
          {
            trigger: () =>
              h(
                'span',
                { style: 'font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; cursor: help;' },
                truncated,
              ),
            default: () =>
              h(
                'span',
                { style: 'word-break: break-all; font-size: 11px;' },
                row.magnet_uri!,
              ),
          },
        )
      }
      return h(
        'span',
        { style: 'font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px;' },
        truncated,
      )
    },
  },
  {
    title: t('torrents.col.size'),
    key: 'size',
    render: (row) => row.size ?? '—',
  },
  {
    title: t('torrents.col.resolution'),
    key: 'resolution_type',
    render: (row) =>
      h(
        NTag,
        { size: 'small', round: true, type: resolutionTagType(row.resolution_type) },
        () => resolutionLabel(row.resolution_type),
      ),
  },
  {
    title: t('torrents.col.subtitle'),
    key: 'subtitle_indicator',
    render: (row) =>
      h(
        NTag,
        { size: 'small', round: true, type: row.subtitle_indicator === 1 ? 'success' : 'default' },
        () => (row.subtitle_indicator === 1 ? t('common.yes') : t('common.no')),
      ),
  },
  {
    title: t('torrents.col.censor'),
    key: 'censor_indicator',
    render: (row) =>
      h(
        NTag,
        { size: 'small', round: true, type: row.censor_indicator === 1 ? 'warning' : 'default' },
        () => (row.censor_indicator === 1 ? t('torrents.label.uncensored') : t('torrents.label.censored')),
      ),
  },
  {
    title: t('torrents.col.fileCount'),
    key: 'file_count',
    render: (row) => String(row.file_count),
  },
  {
    title: t('torrents.col.created'),
    key: 'datetime_created',
    render: (row) => formatRelative(row.datetime_created),
  },
  {
    title: t('torrents.col.sessionId'),
    key: 'session_id',
    render: (row) =>
      row.session_id
        ? h(
            'span',
            { style: 'font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px;' },
            row.session_id,
          )
        : '—',
  },
])

const hasMorePages = computed(() => !!nextCursor.value)
</script>

<template>
  <NMessageProvider>
    <div class="torrents-page">
      <header class="page-header">
        <div class="page-header-left">
          <h1>{{ t('nav.torrents') }}</h1>
          <p class="subtitle">
            {{ t('torrents.subtitle') }}
          </p>
        </div>
        <NButton
          :loading="exporting"
          size="small"
          @click="handleExport"
        >
          {{ t('torrents.exportCsv') }}
        </NButton>
      </header>

      <!-- Search bar -->
      <NInput
        v-model:value="searchQuery"
        :placeholder="t('torrents.search')"
        clearable
      />

      <!-- Filter row -->
      <NSpace
        align="center"
        :wrap="true"
        :size="12"
      >
        <NSelect
          v-model:value="resolutionFilter"
          :options="resolutionOptions"
          :placeholder="t('torrents.filters.resolutionPlaceholder')"
          size="small"
          clearable
          style="width: 160px"
        />
        <NSpace
          align="center"
          :size="4"
        >
          <span class="filter-label">{{ t('torrents.filters.subtitle') }}</span>
          <NSwitch
            :value="subtitleFilter ?? false"
            @update:value="(v: boolean) => (subtitleFilter = v ? true : null)"
          />
        </NSpace>
        <NSpace
          align="center"
          :size="4"
        >
          <span class="filter-label">{{ t('torrents.filters.uncensored') }}</span>
          <NSwitch
            :value="uncensoredFilter ?? false"
            @update:value="(v: boolean) => (uncensoredFilter = v ? true : null)"
          />
        </NSpace>
        <NDatePicker
          v-model:value="dateRange"
          type="daterange"
          size="small"
          clearable
          style="width: 260px"
        />
        <NInput
          v-model:value="sessionIdFilter"
          :placeholder="t('torrents.filters.sessionIdPlaceholder')"
          size="small"
          clearable
          style="width: 200px"
        />
        <NButton
          size="small"
          quaternary
          @click="resetFilters"
        >
          {{ t('torrents.filters.reset') }}
        </NButton>
      </NSpace>

      <NAlert
        v-if="error"
        type="error"
        :title="t('errors.generic.title')"
        closable
        @close="error = null"
      >
        {{ error }}
      </NAlert>

      <NCard>
        <NDataTable
          :columns="columns"
          :data="items"
          :loading="loading"
          :row-key="(row: TorrentSearchItem) => row.id"
          striped
          flex-height
          style="min-height: 360px"
        />
      </NCard>

      <!-- Bottom: load more + total -->
      <NSpace
        justify="space-between"
        align="center"
      >
        <span class="total-estimate">
          {{ t('torrents.totalEstimate', { count: totalEstimate }) }}
        </span>
        <NButton
          v-if="hasMorePages"
          :loading="loadingMore"
          @click="loadMore"
        >
          {{ t('torrents.loadMore') }}
        </NButton>
      </NSpace>

      <div
        v-if="!loading && items.length === 0 && !error"
        class="empty-state"
      >
        {{ t('torrents.noResults') }}
      </div>
    </div>
  </NMessageProvider>
</template>

<style scoped>
.torrents-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.page-header-left h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
}
.subtitle {
  color: var(--n-text-color-2);
  font-size: 13px;
  margin-top: 4px;
}
.filter-label {
  font-size: 13px;
  white-space: nowrap;
}
.total-estimate {
  font-size: 13px;
  color: var(--n-text-color-3);
}
.empty-state {
  text-align: center;
  padding: 32px 0;
  color: var(--n-text-color-3);
  font-size: 14px;
}
</style>
