<script setup lang="ts">
import { computed, h, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NCard,
  NAlert,
  NMessageProvider,
  NDataTable,
  NInput,
  NSelect,
  NTag,
  NButton,
  NSwitch,
  NDatePicker,
  NSpace,
  NRate,
  type DataTableColumns,
} from 'naive-ui'
import {
  searchMovies,
  exportMoviesCsv,
  type MovieSearchItem,
  type MovieSearchParams,
} from '@/api/history'
import HeartButton from '@/components/HeartButton.vue'
import StatusControl from '@/components/StatusControl.vue'
import {
  listMovieRatings,
  getMovieRating,
  upsertMovieRating,
  listContentPreferences,
  type MovieRating,
} from '@/api/preferences'
import { listWatchIntents, type WatchStatus } from '@/api/watchlist'
import { useCapabilitiesStore } from '@/stores/capabilities'
import { computePreferenceScore } from './preference-score'
import { reduceBatchKey } from './batch-annotation'
import { createRatingSaver } from './rating-saver'

const { t } = useI18n()
const cap = useCapabilitiesStore()

// Valid tag slugs mirror the backend VALID_TAGS (ADR-022 C1); labels are i18n'd.
const VALID_TAGS = [
  'quality_high',
  'quality_low',
  'resolution_bad',
  'encoding_bad',
  'plot_good',
  'actress_standout',
  'not_my_type',
  'category_miss',
  'would_rewatch',
  'keep_long_term',
  'delete_candidate',
  'upgrade_wanted',
] as const

// ---------- State ----------
const items = ref<MovieSearchItem[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const nextCursor = ref<string | null>(null)
const totalEstimate = ref(0)
const loadingMore = ref(false)
const exporting = ref(false)

// Preferences (ADR-022)
const ratings = ref<Map<string, MovieRating>>(new Map())
const actorHearted = ref<Map<string, boolean>>(new Map())
// In-progress notes text, keyed by href. Keeps the (controlled) notes input
// from losing typed text when a sibling control reassigns `ratings`.
const notesDraft = ref<Map<string, string>>(new Map())

// Watch intents (ADR-054 WS1), keyed by video_code
const watchIntents = ref<Map<string, WatchStatus>>(new Map())

async function loadWatchIntents(): Promise<void> {
  if (!cap.data?.features?.watch_intent) return
  try {
    // Page through the full intent set: the Movies search can show any
    // historical movie, so a single capped fetch would render older tracked
    // movies as "Untracked". Loop until a short page signals the end.
    const PAGE = 200
    const next = new Map<string, WatchStatus>()
    for (let offset = 0; ; offset += PAGE) {
      const { items } = await listWatchIntents({ limit: PAGE, offset })
      for (const it of items) next.set(it.video_code, it.status)
      if (items.length < PAGE) break
    }
    watchIntents.value = next
  } catch {
    // non-fatal: the column simply shows "untracked" for every row
  }
}

// Filters
const searchQuery = ref('')
const actorFilter = ref('')
const perfectMatchFilter = ref<boolean | null>(null)
const hiResFilter = ref<boolean | null>(null)
const sessionIdFilter = ref('')
const dateRange = ref<[number, number] | null>(null)

// Batch annotation mode (ADR-022 C3)
const batchMode = ref(false)
const focusedIndex = ref(0)
const pendingRating = ref<number | null>(null)

function toggleBatch() {
  batchMode.value = !batchMode.value
  focusedIndex.value = 0
  pendingRating.value = null
}

function handleKeydown(e: KeyboardEvent) {
  if (!batchMode.value) return
  // Don't hijack typing in filter inputs while annotation mode is on.
  const target = e.target as HTMLElement | null
  if (
    target &&
    (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
  ) {
    return
  }
  const result = reduceBatchKey(
    e.key,
    { focusedIndex: focusedIndex.value, pendingRating: pendingRating.value },
    items.value.length,
  )
  if (!result) return
  if (result.preventDefault) e.preventDefault()
  focusedIndex.value = result.state.focusedIndex
  pendingRating.value = result.state.pendingRating
  if (result.save) {
    const row = items.value[result.save.index]
    if (row) {
      void saveRating(row.href, { rating: result.save.rating })
    }
  }
}

function rowProps(_row: MovieSearchItem, index: number) {
  return {
    style:
      batchMode.value && index === focusedIndex.value
        ? 'background: rgba(24,160,88,0.12);'
        : '',
  }
}

// Debounce
let debounceTimer: ReturnType<typeof setTimeout> | null = null

function toLocalYmd(ts: number): string {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function buildFilterParams(): MovieSearchParams {
  const params: MovieSearchParams = {}
  if (searchQuery.value) params.q = searchQuery.value
  if (actorFilter.value) params.actor = actorFilter.value
  if (perfectMatchFilter.value != null) params.perfect_match = perfectMatchFilter.value
  if (hiResFilter.value != null) params.hi_res = hiResFilter.value
  if (sessionIdFilter.value) params.session_id = sessionIdFilter.value
  if (dateRange.value) {
    params.date_from = toLocalYmd(dateRange.value[0])
    params.date_to = toLocalYmd(dateRange.value[1])
  }
  return params
}

function buildParams(cursor?: string): MovieSearchParams {
  const params: MovieSearchParams = { ...buildFilterParams(), limit: 50 }
  if (cursor) params.cursor = cursor
  return params
}

async function fetchMovies() {
  loading.value = true
  error.value = null
  try {
    const res = await searchMovies(buildParams())
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
    const res = await searchMovies(buildParams(nextCursor.value))
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
    const blob = await exportMoviesCsv(buildFilterParams())
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'movies.csv'
    a.click()
    URL.revokeObjectURL(url)
  } catch {
    error.value = t('movies.exportFailed')
  } finally {
    exporting.value = false
  }
}

async function loadRatings() {
  const res = await listMovieRatings({ limit: 1000, offset: 0 })
  ratings.value = new Map(res.items.map((r) => [r.href, r]))
}

// Persist a single-field rating edit, merging it over the current row so the
// backend's full-replace upsert never wipes the untouched fields (ADR-022 C1).
// The saver fetches the canonical row when it's missing from the cache (the list
// endpoint is clamped to 200, so not every row is loaded) and serializes saves
// per href so concurrent same-row edits can't clobber each other.
const saveRating = createRatingSaver({
  getCached: (href) => ratings.value.get(href),
  fetchRating: (href) => getMovieRating(href, { skipErrorToast: true }),
  upsert: (href, payload) => upsertMovieRating(href, payload),
  onSaved: (href, row) => {
    ratings.value = new Map(ratings.value).set(href, row)
  },
  onError: (e) => {
    error.value = e instanceof Error ? e.message : String(e)
  },
})

async function loadActorHearted() {
  const res = await listContentPreferences({ content_type: 'actor' })
  actorHearted.value = new Map(res.items.map((p) => [p.content_id, p.hearted]))
}

function preferenceScore(href: string, actorName: string | null): number {
  const r = ratings.value.get(href)
  const hearted = actorName ? (actorHearted.value.get(actorName) ?? false) : false
  return computePreferenceScore(r?.rating ?? null, hearted)
}

function resetFilters() {
  searchQuery.value = ''
  actorFilter.value = ''
  perfectMatchFilter.value = null
  hiResFilter.value = null
  sessionIdFilter.value = ''
  dateRange.value = null
}

function debouncedFetch() {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => fetchMovies(), 300)
}

// Watch all filter changes
watch(
  [searchQuery, actorFilter, perfectMatchFilter, hiResFilter, sessionIdFilter, dateRange],
  () => debouncedFetch(),
)

// Keep the focused row valid when the result set shrinks (e.g. filter change).
watch(items, () => {
  focusedIndex.value = Math.min(focusedIndex.value, Math.max(0, items.value.length - 1))
})

onMounted(() => {
  // Register synchronously so onUnmounted always removes a listener that was
  // actually added (avoids a leak if the component unmounts mid-load).
  window.addEventListener('keydown', handleKeydown)
  void (async () => {
    await fetchMovies()
    await Promise.all([loadRatings(), loadActorHearted()])
  })()
  void loadWatchIntents()
})
onUnmounted(() => {
  if (debounceTimer) clearTimeout(debounceTimer)
  window.removeEventListener('keydown', handleKeydown)
})

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

// Tags + notes editor shown in the expandable row (ADR-022 C1). Both controls
// route through saveRating so a single-field edit never wipes the others.
function renderExpand(row: MovieSearchItem) {
  const current = ratings.value.get(row.href)
  const tagOptions = VALID_TAGS.map((slug) => ({ label: t(`movies.tags.${slug}`), value: slug }))
  return h('div', { style: 'display:flex;flex-direction:column;gap:8px;padding:8px 4px' }, [
    h('div', { style: 'display:flex;align-items:center;gap:8px' }, [
      h('span', { style: 'font-size:13px;white-space:nowrap' }, t('movies.tagsLabel')),
      h(NSelect, {
        multiple: true,
        size: 'small',
        style: 'flex:1',
        options: tagOptions,
        value: current?.tags ?? [],
        placeholder: t('movies.tagsPlaceholder'),
        'onUpdate:value': (val: string[]) => {
          void saveRating(row.href, { tags: val })
        },
      }),
    ]),
    h('div', { style: 'display:flex;align-items:flex-start;gap:8px' }, [
      h('span', { style: 'font-size:13px;white-space:nowrap;padding-top:4px' }, t('movies.notesLabel')),
      h(NInput, {
        type: 'textarea',
        size: 'small',
        style: 'flex:1',
        autosize: { minRows: 1, maxRows: 3 },
        value: notesDraft.value.get(row.href) ?? (current?.notes ?? ''),
        placeholder: t('movies.notesPlaceholder'),
        'onUpdate:value': (v: string) => {
          notesDraft.value = new Map(notesDraft.value).set(row.href, v)
        },
        onBlur: () => {
          const draft = notesDraft.value.get(row.href) ?? ''
          void saveRating(row.href, { notes: draft || null })
        },
      }),
    ]),
  ])
}

const columns = computed<DataTableColumns<MovieSearchItem>>(() => [
  {
    type: 'expand',
    expandable: () => true,
    renderExpand,
  },
  {
    title: t('movies.col.videoCode'),
    key: 'video_code',
    render: (row) =>
      h(
        'span',
        { style: 'font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px;' },
        row.video_code,
      ),
  },
  {
    title: t('movies.col.actorName'),
    key: 'actor_name',
    render: (row) => {
      const name = row.actor_name
      if (!name) return '—'
      return h('div', { style: 'display:flex;align-items:center;gap:4px' }, [
        h('span', name),
        h(HeartButton, {
          contentType: 'actor',
          contentId: name,
          contentName: name,
          initialHearted: actorHearted.value.get(name) ?? false,
          // Reassign a new Map (not in-place set) so the Score column's
          // preferenceScore() recomputes when the actor heart toggles.
          onChange: (val: boolean) => {
            actorHearted.value = new Map(actorHearted.value).set(name, val)
          },
        }),
      ])
    },
  },
  {
    title: t('movies.col.perfectMatch'),
    key: 'perfect_match',
    render: (row) =>
      h(
        NTag,
        { size: 'small', round: true, type: row.perfect_match ? 'success' : 'default' },
        () => (row.perfect_match ? t('common.yes') : t('common.no')),
      ),
  },
  {
    title: t('movies.col.hiRes'),
    key: 'hi_res',
    render: (row) =>
      h(
        NTag,
        { size: 'small', round: true, type: row.hi_res ? 'info' : 'default' },
        () => (row.hi_res ? t('common.yes') : t('common.no')),
      ),
  },
  {
    title: t('movies.col.created'),
    key: 'datetime_created',
    render: (row) => formatRelative(row.datetime_created),
  },
  {
    title: t('movies.col.torrents'),
    key: 'torrent_count',
    render: (row) => String(row.torrent_count),
  },
  {
    title: t('movies.col.rating'),
    key: 'rating',
    width: 180,
    render(row) {
      const rating = ratings.value.get(row.href)
      return h(NRate, {
        value: rating?.rating ?? 0,
        count: 5,
        size: 'small',
        clearable: true,
        'onUpdate:value': (val: number) => {
          void saveRating(row.href, { rating: val || null })
        },
      })
    },
  },
  ...(cap.data?.features?.watch_intent
    ? [
        {
          title: t('movies.col.watchStatus'),
          key: 'watch_status',
          width: 132,
          render: (row: MovieSearchItem) =>
            h(StatusControl, {
              videoCode: row.video_code,
              href: row.href,
              initialStatus: watchIntents.value.get(row.video_code) ?? null,
              onChange: (val: WatchStatus | null) => {
                const next = new Map(watchIntents.value)
                if (val === null) next.delete(row.video_code)
                else next.set(row.video_code, val)
                watchIntents.value = next
              },
            }),
        },
      ]
    : []),
  {
    title: t('movies.col.score'),
    key: 'score',
    width: 70,
    render(row) {
      const score = preferenceScore(row.href, row.actor_name ?? null)
      return h('span', { style: 'font-size:12px;color:var(--n-text-color-3)' }, score.toFixed(2))
    },
  },
  {
    title: t('movies.col.sessionId'),
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
    <div class="movies-page">
      <header class="page-header">
        <div class="page-header-left">
          <h1>{{ t('nav.movies') }}</h1>
          <p class="subtitle">
            {{ t('movies.subtitle') }}
          </p>
        </div>
        <NSpace
          align="center"
          :size="8"
        >
          <NButton
            :type="batchMode ? 'primary' : 'default'"
            size="small"
            @click="toggleBatch"
          >
            {{ batchMode ? t('movies.exitAnnotate') : t('movies.annotate') }}
          </NButton>
          <NButton
            :loading="exporting"
            size="small"
            @click="handleExport"
          >
            {{ t('movies.exportCsv') }}
          </NButton>
        </NSpace>
      </header>

      <div
        v-if="batchMode"
        class="annotate-hint"
      >
        {{
          t('movies.annotateHint', {
            current: items.length ? focusedIndex + 1 : 0,
            total: items.length,
            pending: pendingRating ?? '—',
          })
        }}
      </div>

      <!-- Search bar -->
      <NInput
        v-model:value="searchQuery"
        :placeholder="t('movies.search')"
        clearable
      />

      <!-- Filter row -->
      <NSpace
        align="center"
        :wrap="true"
        :size="12"
      >
        <NInput
          v-model:value="actorFilter"
          :placeholder="t('movies.filters.actorPlaceholder')"
          size="small"
          clearable
          style="width: 180px"
        />
        <NSpace
          align="center"
          :size="4"
        >
          <span class="filter-label">{{ t('movies.filters.perfectMatch') }}</span>
          <NSwitch
            :value="perfectMatchFilter ?? false"
            @update:value="(v: boolean) => (perfectMatchFilter = v ? true : null)"
          />
        </NSpace>
        <NSpace
          align="center"
          :size="4"
        >
          <span class="filter-label">{{ t('movies.filters.hiRes') }}</span>
          <NSwitch
            :value="hiResFilter ?? false"
            @update:value="(v: boolean) => (hiResFilter = v ? true : null)"
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
          :placeholder="t('movies.filters.sessionIdPlaceholder')"
          size="small"
          clearable
          style="width: 200px"
        />
        <NButton
          size="small"
          quaternary
          @click="resetFilters"
        >
          {{ t('movies.filters.reset') }}
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
          :row-key="(row: MovieSearchItem) => row.id"
          :row-props="rowProps"
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
          {{ t('movies.totalEstimate', { count: totalEstimate }) }}
        </span>
        <NButton
          v-if="hasMorePages"
          :loading="loadingMore"
          @click="loadMore"
        >
          {{ t('movies.loadMore') }}
        </NButton>
      </NSpace>

      <div
        v-if="!loading && items.length === 0 && !error"
        class="empty-state"
      >
        {{ t('movies.noResults') }}
      </div>
    </div>
  </NMessageProvider>
</template>

<style scoped>
.movies-page {
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
.annotate-hint {
  font-size: 12px;
  color: var(--n-text-color-3);
}
</style>
