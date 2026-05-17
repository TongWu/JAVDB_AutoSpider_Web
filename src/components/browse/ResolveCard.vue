<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NCard,
  NSpace,
  NTag,
  NButton,
  NEmpty,
  NAlert,
  useMessage,
} from 'naive-ui'
import { useAuthStore } from '@/stores/auth'
import { useBrowseStore, type ResolveResult, type MagnetRow } from '@/stores/browse'
import { extractErrorMessage } from '@/api/errors'
import ResolveMagnetTable from './ResolveMagnetTable.vue'

const props = defineProps<{ result: ResolveResult }>()

const { t } = useI18n()
const auth = useAuthStore()
const browse = useBrowseStore()
const message = useMessage()

const isAdmin = computed(() => auth.role === 'admin')
const oneClickLoading = ref(false)

// `detail` and `index` are loose `Record<string, unknown>` on the BE schema.
// Pull common fields defensively.
const detail = computed<Record<string, unknown> | null>(() => {
  if (props.result.kind !== 'detail') return null
  const d = props.result.data
  return (d.detail as Record<string, unknown> | null | undefined) ?? null
})

const title = computed(() => stringField(detail.value, ['title', 'name'], ''))
const code = computed(() => stringField(detail.value, ['code', 'video_code'], ''))
const releaseDate = computed(() =>
  stringField(detail.value, ['release_date', 'date'], ''),
)
const thumbnail = computed(() =>
  stringField(detail.value, ['cover', 'image_url', 'thumbnail'], ''),
)
const url = computed(() => {
  if (props.result.kind !== 'detail') return ''
  return props.result.data.url || ''
})

const actors = computed<string[]>(() => stringList(detail.value, ['actors', 'actresses']))
const tags = computed<string[]>(() => stringList(detail.value, ['tags', 'categories', 'genres']))

const magnets = computed<MagnetRow[]>(() => {
  const raw = detail.value?.magnets ?? detail.value?.torrents
  if (!Array.isArray(raw)) return []
  return raw as MagnetRow[]
})

// Code-search result branch: render the candidate list, not a detail card.
const codeMovies = computed<Record<string, unknown>[]>(() => {
  if (props.result.kind !== 'code') return []
  const list = props.result.data.movies
  return Array.isArray(list) ? (list as Record<string, unknown>[]) : []
})
const exactMatch = computed<Record<string, string> | null>(() => {
  if (props.result.kind !== 'code') return null
  return (
    (props.result.data.exact_match_entry as Record<string, string> | null | undefined) ?? null
  )
})

async function onOneClick(): Promise<void> {
  const detailUrl = url.value || (exactMatch.value?.href ?? '')
  if (!detailUrl) {
    message.error(t('browse.resolve.oneClick.noUrl'))
    return
  }
  oneClickLoading.value = true
  try {
    const res = await browse.oneClick(detailUrl)
    if (res.status === 'ok') {
      message.success(t('browse.resolve.oneClick.queued'))
    } else {
      message.warning(`${t('browse.resolve.oneClick.failed')}: ${res.status}`)
    }
  } catch (err) {
    message.error(extractErrorMessage(err))
  } finally {
    oneClickLoading.value = false
  }
}

async function onResolveExact(): Promise<void> {
  const href = exactMatch.value?.href
  if (!href) return
  try {
    await browse.submit(href)
  } catch {
    /* error surfaced via toast */
  }
}

function stringField(obj: Record<string, unknown> | null, keys: string[], fallback: string): string {
  if (!obj) return fallback
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === 'string' && v.trim()) return v
  }
  return fallback
}

function stringList(obj: Record<string, unknown> | null, keys: string[]): string[] {
  if (!obj) return []
  for (const k of keys) {
    const v = obj[k]
    if (Array.isArray(v)) {
      return v.filter((x): x is string => typeof x === 'string' && x.length > 0)
    }
  }
  return []
}
</script>

<template>
  <NCard size="small" :bordered="true" class="resolve-card">
    <!-- DETAIL branch: the URL was resolved into a single movie detail. -->
    <template v-if="props.result.kind === 'detail'">
      <div class="detail-head">
        <img v-if="thumbnail" :src="thumbnail" :alt="title" class="thumb" loading="lazy" />
        <div class="meta">
          <div class="title-row">
            <h3 class="title">{{ title || t('browse.resolve.untitled') }}</h3>
            <NTag v-if="code" size="small" type="success" round>{{ code }}</NTag>
          </div>
          <p v-if="releaseDate" class="muted">{{ releaseDate }}</p>
          <NSpace v-if="actors.length" :size="4" wrap>
            <NTag v-for="a in actors" :key="a" size="tiny" round>{{ a }}</NTag>
          </NSpace>
          <NSpace v-if="tags.length" :size="4" wrap style="margin-top: 6px;">
            <NTag v-for="g in tags" :key="g" size="tiny" type="info" round>{{ g }}</NTag>
          </NSpace>
          <NSpace v-if="isAdmin" style="margin-top: 10px;">
            <NButton
              type="primary"
              size="small"
              :loading="oneClickLoading"
              :disabled="!url && !exactMatch?.href"
              @click="onOneClick"
            >
              {{ t('browse.resolve.oneClick.button') }}
            </NButton>
          </NSpace>
        </div>
      </div>
      <ResolveMagnetTable :magnets="magnets" />
    </template>

    <!-- CODE branch: search-by-code returned multiple candidates. -->
    <template v-else>
      <NAlert v-if="codeMovies.length === 0" type="info" :show-icon="true">
        {{ t('browse.resolve.code.noResults', { code: props.result.data.video_code }) }}
      </NAlert>
      <template v-else>
        <NAlert v-if="exactMatch" type="success" :show-icon="true" style="margin-bottom: 10px;">
          {{ t('browse.resolve.code.exactMatch', { title: exactMatch.title ?? exactMatch.code ?? '?' }) }}
          <NButton size="tiny" tertiary style="margin-left: 8px;" @click="onResolveExact">
            {{ t('browse.resolve.code.openDetail') }}
          </NButton>
        </NAlert>
        <ul class="code-results">
          <li v-for="(m, idx) in codeMovies" :key="(m.href as string) ?? idx" class="code-row">
            <a
              v-if="typeof m.href === 'string'"
              href="#"
              @click.prevent="browse.submit(m.href as string)"
            >{{ (m.code as string) ?? '?' }} — {{ (m.title as string) ?? '' }}</a>
            <span v-else>{{ (m.title as string) ?? '?' }}</span>
          </li>
        </ul>
      </template>
      <NEmpty v-if="codeMovies.length === 0 && !exactMatch" />
    </template>
  </NCard>
</template>

<style scoped>
.resolve-card { margin-top: 12px; }
.detail-head {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
}
.thumb {
  width: 160px;
  height: auto;
  border-radius: 8px;
  object-fit: cover;
  background: var(--n-color-modal);
  flex-shrink: 0;
}
.meta { flex: 1; min-width: 0; }
.title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.3;
}
.muted {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--n-text-color-2);
}
.code-results {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.code-row {
  font-size: 13px;
}
.code-row a {
  color: var(--n-primary-color);
  text-decoration: none;
}
.code-row a:hover {
  text-decoration: underline;
}
</style>
