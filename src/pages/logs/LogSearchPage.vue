<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import {
  NAlert,
  NButton,
  NCard,
  NDataTable,
  NDatePicker,
  NEmpty,
  NInput,
  NSpace,
  NTag,
  type DataTableColumns,
} from 'naive-ui'
import { searchLogs, type LogSearchItem } from '@/api/logs'
import { useAuthStore } from '@/stores/auth'

const { t } = useI18n()
const router = useRouter()
const auth = useAuthStore()

// ── Access guard ─────────────────────────────────────────────────────
onMounted(() => {
  if (!auth.hasRole('admin')) {
    void router.replace('/403')
  }
})

// ── Search state ──────────────────────────────────────────────────────
const query = ref('')
const jobIdFilter = ref('')
const dateRange = ref<[number, number] | null>(null)
const loading = ref(false)
const searchError = ref<string | null>(null)
const results = ref<LogSearchItem[]>([])
const totalMatched = ref(0)
const truncated = ref(false)
const hasSearched = ref(false)

async function doSearch() {
  const q = query.value.trim()
  if (!q) return

  loading.value = true
  searchError.value = null
  try {
    const params: Parameters<typeof searchLogs>[0] = { q }
    if (jobIdFilter.value.trim()) params.job_id = jobIdFilter.value.trim()
    if (dateRange.value) {
      params.date_from = new Date(dateRange.value[0]).toISOString().slice(0, 10)
      params.date_to = new Date(dateRange.value[1]).toISOString().slice(0, 10)
    }
    const res = await searchLogs(params)
    results.value = res.results
    totalMatched.value = res.total_matched
    truncated.value = res.truncated
    hasSearched.value = true
  } catch (e) {
    searchError.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

function onEnter(e: KeyboardEvent) {
  if (e.key === 'Enter') void doSearch()
}

// ── Highlight helper ──────────────────────────────────────────────────
function highlightText(text: string, needle: string) {
  if (!needle) return h('span', text)
  const parts = text.split(new RegExp(`(${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'))
  return h(
    'span',
    { class: 'log-text' },
    parts.map((part, i) =>
      part.toLowerCase() === needle.toLowerCase()
        ? h('mark', { key: i, class: 'log-highlight' }, part)
        : h('span', { key: i }, part),
    ),
  )
}

// ── Table columns ─────────────────────────────────────────────────────
const columns = computed<DataTableColumns<LogSearchItem>>(() => [
  {
    title: t('logs.col.jobId'),
    key: 'job_id',
    width: 200,
    ellipsis: { tooltip: true },
    render: (row) =>
      h(NTag, { size: 'small', style: 'font-family: monospace; max-width: 180px' }, () => row.job_id),
  },
  {
    title: t('logs.col.lineNumber'),
    key: 'line_number',
    width: 70,
    align: 'right',
    render: (row) => h('span', { style: 'font-variant-numeric: tabular-nums; color: var(--n-text-color-3)' }, String(row.line_number)),
  },
  {
    title: t('logs.col.text'),
    key: 'text',
    render: (row) => highlightText(row.text, query.value.trim()),
  },
  {
    title: t('logs.col.kind'),
    key: 'kind',
    width: 90,
    render: (row) =>
      h(NTag, { size: 'small', type: kindTagType(row.kind) }, () => row.kind),
  },
  {
    title: t('logs.col.createdAt'),
    key: 'created_at',
    width: 170,
    render: (row) =>
      h('span', { style: 'font-variant-numeric: tabular-nums; white-space: nowrap' }, new Date(row.created_at).toLocaleString()),
  },
])

function kindTagType(kind: string): 'default' | 'info' | 'success' | 'warning' | 'error' {
  const k = kind.toLowerCase()
  if (k === 'error') return 'error'
  if (k === 'warning' || k === 'warn') return 'warning'
  if (k === 'info') return 'info'
  if (k === 'success') return 'success'
  return 'default'
}

const showingText = computed(() =>
  t('logs.showing', { shown: results.value.length, total: totalMatched.value }),
)
</script>

<template>
  <div class="log-search-page">
    <header class="page-header">
      <div class="page-header-left">
        <h1>{{ t('nav.logs') }}</h1>
        <p class="subtitle">
          {{ t('logs.subtitle') }}
        </p>
      </div>
    </header>

    <!-- Search controls -->
    <NCard size="small">
      <NSpace
        vertical
        :size="12"
      >
        <NSpace
          align="center"
          :wrap="true"
          :size="8"
        >
          <NInput
            v-model:value="query"
            :placeholder="t('logs.searchPlaceholder')"
            clearable
            style="min-width: 260px; flex: 1"
            @keydown="onEnter"
          />
          <NInput
            v-model:value="jobIdFilter"
            :placeholder="t('logs.jobIdPlaceholder')"
            clearable
            style="min-width: 200px"
            @keydown="onEnter"
          />
          <NDatePicker
            v-model:value="dateRange"
            type="daterange"
            clearable
            style="min-width: 240px"
          />
          <NButton
            type="primary"
            :loading="loading"
            :disabled="!query.trim()"
            @click="doSearch"
          >
            {{ t('logs.search') }}
          </NButton>
        </NSpace>
      </NSpace>
    </NCard>

    <!-- Error -->
    <NAlert
      v-if="searchError"
      type="error"
      closable
      @close="searchError = null"
    >
      {{ searchError }}
    </NAlert>

    <!-- Truncation warning -->
    <NAlert
      v-if="truncated && hasSearched"
      type="warning"
    >
      {{ t('logs.truncated') }}
    </NAlert>

    <!-- Results table -->
    <NCard
      v-if="hasSearched"
      size="small"
    >
      <div
        v-if="results.length > 0"
        class="results-meta"
      >
        {{ showingText }}
      </div>

      <NDataTable
        v-if="results.length > 0"
        :columns="columns"
        :data="results"
        :loading="loading"
        :row-key="(row: LogSearchItem) => `${row.job_id}:${row.line_number}`"
        striped
        :max-height="560"
      />

      <NEmpty
        v-else-if="!loading"
        :description="t('logs.noResults')"
        style="padding: 32px 0"
      />
    </NCard>

    <!-- Empty state: no search yet -->
    <NCard
      v-else
      size="small"
    >
      <NEmpty
        :description="t('logs.empty')"
        style="padding: 40px 0"
      />
    </NCard>
  </div>
</template>

<style scoped>
.log-search-page {
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

.results-meta {
  font-size: 13px;
  color: var(--n-text-color-2);
  margin-bottom: 10px;
}

:deep(.log-text) {
  font-family: monospace;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
}

:deep(.log-highlight) {
  background-color: rgba(255, 210, 0, 0.35);
  color: inherit;
  border-radius: 2px;
  padding: 0 1px;
}
</style>
