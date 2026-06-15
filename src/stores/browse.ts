import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useStorage } from '@vueuse/core'
import {
  apiSearchByVideoCode,
  apiResolve,
  apiDownloadMagnet,
  apiOneClick,
  apiSyncCookie,
  apiAggregateMagnets,
  type VideoCodeSearchResponse,
  type ExploreResolveResponse,
  type ExploreOneClickResponse,
} from '@/api/explore'
import { apiParseUrl } from '@/api/parse'
import { useCapabilitiesStore } from '@/stores/capabilities'

export type BrowseMode = 'resolve' | 'lists' | 'preview'
export type ListsTabKey = 'top' | 'categories' | 'tags' | 'custom'

const VIDEO_CODE_RE = /^[A-Z0-9]{2,8}-\d{2,5}$/i
const JAVDB_URL_RE = /^https?:\/\/(?:[a-z0-9-]+\.)*javdb\.com\//i

export type ResolveResult =
  | { kind: 'code'; data: VideoCodeSearchResponse }
  | { kind: 'detail'; data: ExploreResolveResponse }

export interface MagnetRow {
  magnet?: string
  title?: string
  size?: string
  quality?: string
  date?: string
  href?: string
  source?: string
  sources?: string[]
  quality_score?: number
  quality_reasons?: string[]
  [key: string]: unknown
}

export interface ListsCardData {
  href: string
  title: string
  code: string
  thumbnail: string
  raw: Record<string, unknown>
}

// Default URL templates per Lists tab. Operators can edit the URL inline.
export const LISTS_TAB_DEFAULTS: Record<ListsTabKey, string> = {
  top: 'https://javdb.com/rankings/movies?p=daily&t=censored',
  categories: 'https://javdb.com/categories',
  tags: 'https://javdb.com/tags',
  custom: '',
}

export const useBrowseStore = defineStore('browse', () => {
  const mode = ref<BrowseMode>('resolve')
  const query = ref<string>('')
  const submitting = ref(false)
  const error = ref<string | null>(null)
  const lastResolve = ref<ResolveResult | null>(null)

  const recentSearches = useStorage<string[]>(
    'browse:recent',
    [],
    sessionStorage,
  )

  function pushRecent(q: string): void {
    const trimmed = q.trim()
    if (!trimmed) return
    const next = [trimmed, ...recentSearches.value.filter((x) => x !== trimmed)]
    recentSearches.value = next.slice(0, 10)
  }

  function setMode(m: BrowseMode): void {
    mode.value = m
  }

  function classifyQuery(q: string): 'code' | 'url' | null {
    const trimmed = q.trim()
    if (!trimmed) return null
    if (VIDEO_CODE_RE.test(trimmed)) return 'code'
    if (JAVDB_URL_RE.test(trimmed)) return 'url'
    return null
  }

  async function submit(q: string): Promise<void> {
    const trimmed = q.trim()
    if (!trimmed) return
    const kind = classifyQuery(trimmed)
    if (kind === null) {
      error.value = 'Enter a video code (e.g. ABC-123) or a javdb.com URL'
      return
    }
    query.value = trimmed
    submitting.value = true
    error.value = null
    try {
      if (kind === 'code') {
        const data = await apiSearchByVideoCode(trimmed.toUpperCase())
        lastResolve.value = { kind: 'code', data }
      } else {
        const data = await apiResolve(trimmed)
        lastResolve.value = { kind: 'detail', data }
      }
      pushRecent(trimmed)
    } catch (err) {
      lastResolve.value = null
      error.value = err instanceof Error ? err.message : String(err)
      throw err
    } finally {
      submitting.value = false
    }
  }

  async function downloadMagnet(
    magnet: string,
    title = '',
    category: string | null = null,
  ): Promise<void> {
    await apiDownloadMagnet(magnet, title, category)
  }

  async function aggregateMagnets(
    videoCode: string,
  ): Promise<{ rows: MagnetRow[]; error: string | null }> {
    const cap = useCapabilitiesStore()
    if (!cap.data?.features?.magnet_aggregation) return { rows: [], error: null }
    try {
      const res = await apiAggregateMagnets(videoCode)
      // Map the aggregated shape onto the table's MagnetRow shape: the table reads
      // magnet/title/size, so alias magnet_uri→magnet, name→title. source is the
      // joined provenance label; quality_score/quality_reasons drive the gated column.
      const rows: MagnetRow[] = res.magnets.map((m) => ({
        magnet: m.magnet_uri,
        title: m.name,
        size: m.size,
        source: m.sources.join(', '),
        sources: m.sources,
        quality_score: m.quality_score,
        quality_reasons: m.quality_reasons,
      }))
      return { rows, error: null }
    } catch (err) {
      return { rows: [], error: err instanceof Error ? err.message : 'aggregation failed' }
    }
  }

  async function oneClick(detailUrl: string): Promise<ExploreOneClickResponse> {
    return apiOneClick(detailUrl)
  }

  async function syncCookie(cookie: string): Promise<void> {
    await apiSyncCookie(cookie)
  }

  function reset(): void {
    lastResolve.value = null
    query.value = ''
    error.value = null
  }

  const hasResult = computed(() => lastResolve.value !== null)

  // -----------------------------------------------------------------
  // Lists sub-mode state
  // -----------------------------------------------------------------

  const listsTab = ref<ListsTabKey>('top')
  const listsUrl = ref<string>(LISTS_TAB_DEFAULTS.top)
  const listsPageNum = ref(1)
  const listsCards = ref<ListsCardData[]>([])
  const listsHasMore = ref(false)
  const listsLoading = ref(false)
  const listsError = ref<string | null>(null)

  function setListsTab(tab: ListsTabKey): void {
    listsTab.value = tab
    listsUrl.value = LISTS_TAB_DEFAULTS[tab]
    listsCards.value = []
    listsPageNum.value = 1
    listsHasMore.value = false
    listsError.value = null
  }

  function normaliseListsCard(raw: Record<string, unknown>): ListsCardData | null {
    const href = stringField(raw, ['href', 'url', 'link'])
    if (!href) return null
    return {
      href: ensureAbsolute(href),
      title: stringField(raw, ['title', 'name']) || '',
      code: stringField(raw, ['code', 'video_code']) || '',
      thumbnail: stringField(raw, ['image_url', 'cover', 'thumbnail']) || '',
      raw,
    }
  }

  async function loadListsPage(opts: { reset?: boolean } = {}): Promise<void> {
    if (!listsUrl.value.trim()) {
      listsError.value = 'Enter a javdb.com URL'
      return
    }
    if (opts.reset) {
      listsPageNum.value = 1
      listsCards.value = []
      listsHasMore.value = false
    }
    listsLoading.value = true
    listsError.value = null
    try {
      const resp = await apiParseUrl(listsUrl.value.trim(), {
        page_num: listsPageNum.value,
      })
      const moviesRaw = Array.isArray(resp.movies) ? (resp.movies as Record<string, unknown>[]) : []
      const cards = moviesRaw
        .map(normaliseListsCard)
        .filter((c): c is ListsCardData => c !== null)
      if (opts.reset) {
        listsCards.value = cards
      } else {
        listsCards.value = [...listsCards.value, ...cards]
      }
      const totalPages = typeof resp.total_pages === 'number' ? resp.total_pages : null
      listsHasMore.value =
        totalPages !== null
          ? listsPageNum.value < totalPages
          : cards.length > 0
    } catch (err) {
      listsError.value = err instanceof Error ? err.message : String(err)
      throw err
    } finally {
      listsLoading.value = false
    }
  }

  async function loadMoreLists(): Promise<void> {
    if (listsLoading.value || !listsHasMore.value) return
    listsPageNum.value += 1
    await loadListsPage()
  }

  return {
    mode,
    query,
    submitting,
    error,
    lastResolve,
    recentSearches,
    hasResult,
    setMode,
    classifyQuery,
    submit,
    downloadMagnet,
    aggregateMagnets,
    oneClick,
    syncCookie,
    pushRecent,
    reset,
    // Lists sub-mode
    listsTab,
    listsUrl,
    listsPageNum,
    listsCards,
    listsHasMore,
    listsLoading,
    listsError,
    setListsTab,
    loadListsPage,
    loadMoreLists,
  }
})

function stringField(obj: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === 'string' && v.trim()) return v
  }
  return ''
}

function ensureAbsolute(href: string): string {
  if (/^https?:\/\//i.test(href)) return href
  if (href.startsWith('//')) return `https:${href}`
  if (href.startsWith('/')) return `https://javdb.com${href}`
  return href
}
