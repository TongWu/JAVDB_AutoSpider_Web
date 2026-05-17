import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  apiListSessions,
  apiGetSession,
  type SessionItem,
  type SessionDetailResponse,
} from '@/api/sessions'

export interface SessionFilters {
  state: string[]
  writeMode: string | null
  search: string
}

const ACTIVE_STATES = new Set(['in_progress', 'finalizing'])

export const useSessionsStore = defineStore('sessions', () => {
  const items = ref<SessionItem[]>([])
  const nextCursor = ref<string | null>(null)
  const totalEstimate = ref<number | null>(null)
  const loading = ref(false)
  const loadingMore = ref(false)
  const error = ref<unknown>(null)

  const filters = ref<SessionFilters>({
    state: [],
    writeMode: null,
    search: '',
  })

  const detailCache = ref<Map<string, SessionDetailResponse>>(new Map())
  const detailLoading = ref(false)

  const hasActiveSession = computed(() =>
    items.value.some((s) => ACTIVE_STATES.has(String(s.state ?? '').toLowerCase())),
  )

  const filteredItems = computed(() => {
    let list = items.value
    const f = filters.value
    if (f.state.length > 0) {
      list = list.filter((s) => f.state.includes(String(s.state ?? '')))
    }
    if (f.writeMode) {
      list = list.filter(
        (s) => String(s.write_mode ?? '').toLowerCase() === f.writeMode!.toLowerCase(),
      )
    }
    if (f.search.trim()) {
      const q = f.search.toLowerCase()
      list = list.filter((s) => String(s.session_id ?? '').toLowerCase().includes(q))
    }
    return list
  })

  async function fetchList(reset = true): Promise<SessionItem[]> {
    loading.value = true
    error.value = null
    try {
      const resp = await apiListSessions({ limit: 100 })
      const list = resp.items ?? []
      items.value = reset ? list : [...items.value, ...list]
      nextCursor.value = resp.next_cursor ?? null
      totalEstimate.value = resp.total_estimate ?? null
      return list
    } catch (err) {
      error.value = err
      throw err
    } finally {
      loading.value = false
    }
  }

  async function loadMore(): Promise<void> {
    if (!nextCursor.value || loadingMore.value) return
    loadingMore.value = true
    try {
      const resp = await apiListSessions({ cursor: nextCursor.value, limit: 100 })
      items.value = [...items.value, ...(resp.items ?? [])]
      nextCursor.value = resp.next_cursor ?? null
    } catch (err) {
      error.value = err
      throw err
    } finally {
      loadingMore.value = false
    }
  }

  async function refresh(): Promise<void> {
    await fetchList(true)
  }

  async function getDetail(sessionId: string, force = false): Promise<SessionDetailResponse> {
    if (!force) {
      const cached = detailCache.value.get(sessionId)
      if (cached) return cached
    }
    detailLoading.value = true
    try {
      const resp = await apiGetSession(sessionId)
      detailCache.value.set(sessionId, resp)
      return resp
    } finally {
      detailLoading.value = false
    }
  }

  function invalidateDetail(sessionId: string): void {
    detailCache.value.delete(sessionId)
  }

  function setFilter<K extends keyof SessionFilters>(key: K, value: SessionFilters[K]): void {
    filters.value = { ...filters.value, [key]: value }
  }

  function resetFilters(): void {
    filters.value = { state: [], writeMode: null, search: '' }
  }

  return {
    items,
    nextCursor,
    totalEstimate,
    loading,
    loadingMore,
    error,
    filters,
    detailLoading,
    hasActiveSession,
    filteredItems,
    fetchList,
    loadMore,
    refresh,
    getDetail,
    invalidateDetail,
    setFilter,
    resetFilters,
  }
})
