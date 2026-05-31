<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
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
import {
  listContentPreferences,
  getMovieMetadata,
  type MovieMetadata,
} from '@/api/preferences'
import HeartButton from '@/components/HeartButton.vue'
import { extractDimensionNames } from './resolve-dimensions'
import ResolveMagnetTable from './ResolveMagnetTable.vue'

const props = defineProps<{ result: ResolveResult }>()

const { t } = useI18n()
const auth = useAuthStore()
const browse = useBrowseStore()
const message = useMessage()

const isAdmin = computed(() => auth.role === 'admin')
const oneClickLoading = ref(false)

// ADR-022 §C4 — hearted state per dimension. Keyed by content_id, which equals
// the dimension name (name-as-id convention) so rows are shared across pages.
// Preferences load asynchronously after first paint, so this stays reactive to
// flip chips from white to filled hearts once the lists arrive.
type HeartDimension = 'actor' | 'category' | 'maker' | 'director'
const hearted = ref<Record<HeartDimension, Map<string, boolean>>>({
  actor: new Map(),
  category: new Map(),
  maker: new Map(),
  director: new Map(),
})

// maker/director are absent from the resolve detail; fetch them from metadata.
const metadata = ref<MovieMetadata | null>(null)
const makers = computed<string[]>(() => extractDimensionNames(metadata.value?.maker))
const directors = computed<string[]>(() => extractDimensionNames(metadata.value?.directors))

function isHearted(dim: HeartDimension, name: string): boolean {
  return hearted.value[dim].get(name) ?? false
}

function setHearted(dim: HeartDimension, name: string, val: boolean): void {
  hearted.value[dim].set(name, val)
}

async function loadHearted(dim: HeartDimension): Promise<void> {
  try {
    const res = await listContentPreferences({ content_type: dim })
    hearted.value[dim] = new Map(res.items.map((p) => [p.content_id, p.hearted]))
  } catch {
    // Best-effort: leave the map empty so chips default to un-hearted.
  }
}

async function loadMetadata(detailUrl: string): Promise<void> {
  metadata.value = null
  if (!detailUrl) return
  try {
    metadata.value = await getMovieMetadata(detailUrl)
  } catch {
    // Supplementary data — a failure just hides the maker/director chips.
    metadata.value = null
  }
}

onMounted(() => {
  void Promise.all([
    loadHearted('actor'),
    loadHearted('category'),
    loadHearted('maker'),
    loadHearted('director'),
  ])
})

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

// Re-fetch metadata whenever the resolved detail URL changes (the card instance
// is reused across resolves, so a watcher — not onMounted — is required).
watch(url, (u) => void loadMetadata(u), { immediate: true })

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
  <NCard
    size="small"
    :bordered="true"
    class="resolve-card"
  >
    <!-- DETAIL branch: the URL was resolved into a single movie detail. -->
    <template v-if="props.result.kind === 'detail'">
      <div class="detail-head">
        <img
          v-if="thumbnail"
          :src="thumbnail"
          :alt="title"
          class="thumb"
          loading="lazy"
        >
        <div class="meta">
          <div class="title-row">
            <h3 class="title">
              {{ title || t('browse.resolve.untitled') }}
            </h3>
            <NTag
              v-if="code"
              size="small"
              type="success"
              round
            >
              {{ code }}
            </NTag>
          </div>
          <p
            v-if="releaseDate"
            class="muted"
          >
            {{ releaseDate }}
          </p>
          <NSpace
            v-if="actors.length"
            :size="4"
            wrap
          >
            <span
              v-for="a in actors"
              :key="a"
              class="chip"
            >
              <NTag
                size="tiny"
                round
              >
                {{ a }}
              </NTag>
              <HeartButton
                content-type="actor"
                :content-id="a"
                :content-name="a"
                :initial-hearted="isHearted('actor', a)"
                @change="(v: boolean) => setHearted('actor', a, v)"
              />
            </span>
          </NSpace>
          <NSpace
            v-if="tags.length"
            :size="4"
            wrap
            style="margin-top: 6px;"
          >
            <span
              v-for="g in tags"
              :key="g"
              class="chip"
            >
              <NTag
                size="tiny"
                type="info"
                round
              >
                {{ g }}
              </NTag>
              <HeartButton
                content-type="category"
                :content-id="g"
                :content-name="g"
                :initial-hearted="isHearted('category', g)"
                @change="(v: boolean) => setHearted('category', g, v)"
              />
            </span>
          </NSpace>
          <NSpace
            v-if="makers.length"
            :size="4"
            wrap
            align="center"
            style="margin-top: 6px;"
          >
            <span class="dim-label">{{ t('browse.resolve.dimensions.maker') }}</span>
            <span
              v-for="m in makers"
              :key="m"
              class="chip"
            >
              <NTag
                size="tiny"
                type="warning"
                round
              >
                {{ m }}
              </NTag>
              <HeartButton
                content-type="maker"
                :content-id="m"
                :content-name="m"
                :initial-hearted="isHearted('maker', m)"
                @change="(v: boolean) => setHearted('maker', m, v)"
              />
            </span>
          </NSpace>
          <NSpace
            v-if="directors.length"
            :size="4"
            wrap
            align="center"
            style="margin-top: 6px;"
          >
            <span class="dim-label">{{ t('browse.resolve.dimensions.director') }}</span>
            <span
              v-for="d in directors"
              :key="d"
              class="chip"
            >
              <NTag
                size="tiny"
                type="success"
                round
              >
                {{ d }}
              </NTag>
              <HeartButton
                content-type="director"
                :content-id="d"
                :content-name="d"
                :initial-hearted="isHearted('director', d)"
                @change="(v: boolean) => setHearted('director', d, v)"
              />
            </span>
          </NSpace>
          <NSpace
            v-if="isAdmin"
            style="margin-top: 10px;"
          >
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
      <NAlert
        v-if="codeMovies.length === 0"
        type="info"
        :show-icon="true"
      >
        {{ t('browse.resolve.code.noResults', { code: props.result.data.video_code }) }}
      </NAlert>
      <template v-else>
        <NAlert
          v-if="exactMatch"
          type="success"
          :show-icon="true"
          style="margin-bottom: 10px;"
        >
          {{ t('browse.resolve.code.exactMatch', { title: exactMatch.title ?? exactMatch.code ?? '?' }) }}
          <NButton
            size="tiny"
            tertiary
            style="margin-left: 8px;"
            @click="onResolveExact"
          >
            {{ t('browse.resolve.code.openDetail') }}
          </NButton>
        </NAlert>
        <ul class="code-results">
          <li
            v-for="(m, idx) in codeMovies"
            :key="(m.href as string) ?? idx"
            class="code-row"
          >
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
.chip {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
.dim-label {
  font-size: 11px;
  color: var(--n-text-color-3);
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
