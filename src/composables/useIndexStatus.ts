import { onScopeDispose, ref, shallowRef, type Ref, type ShallowRef } from 'vue'
import { apiIndexStatus, type ExploreIndexStatusItem } from '@/api/explore'
import type { IndexStatus, IndexStatusMeta } from '@/components/browse/D1StatusDot.vue'

const FLUSH_DEBOUNCE_MS = 150
const FLUSH_BATCH_SIZE = 50

export interface IndexStatusEntry {
  status: IndexStatus
  meta?: IndexStatusMeta
}

export interface UseIndexStatusReturn {
  observe(href: string): void
  unobserve(href: string): void
  statuses: ShallowRef<Map<string, IndexStatusEntry>>
  isFetching: Ref<boolean>
  /** Force-flush any queued hrefs (useful for tests). */
  flushNow(): Promise<void>
}

function classify(item: ExploreIndexStatusItem | undefined): IndexStatusEntry {
  if (!item) return { status: 'unknown' }
  // Current BE shape: { downloaded, has_uncensored } plus optional extras
  // (session_id / last_seen / last_error if present). Map conservatively.
  if (item.downloaded) {
    return {
      status: 'committed',
      meta: extractMeta(item),
    }
  }
  // The "pending" / "failed_recent" buckets need explicit BE fields. When the
  // BE response grows, expand here. For now, anything non-downloaded surfaces
  // as 'unknown' so the UI never lies about commit state.
  return { status: 'unknown', meta: extractMeta(item) }
}

function extractMeta(item: ExploreIndexStatusItem): IndexStatusMeta | undefined {
  const extra = item as unknown as Record<string, unknown>
  const sessionId = typeof extra.session_id === 'string' ? extra.session_id : undefined
  const lastSeen = typeof extra.last_seen === 'string' ? extra.last_seen : undefined
  const lastError = typeof extra.last_error === 'string' ? extra.last_error : undefined
  if (!sessionId && !lastSeen && !lastError) return undefined
  return { session_id: sessionId, last_seen: lastSeen, last_error: lastError }
}

export function useIndexStatus(): UseIndexStatusReturn {
  const statuses = shallowRef<Map<string, IndexStatusEntry>>(new Map())
  const isFetching = ref(false)
  const queue = new Set<string>()
  let flushTimer: ReturnType<typeof setTimeout> | null = null

  function scheduleFlush(): void {
    if (flushTimer !== null) return
    flushTimer = setTimeout(() => {
      flushTimer = null
      void flushNow()
    }, FLUSH_DEBOUNCE_MS)
  }

  async function flushNow(): Promise<void> {
    if (queue.size === 0) return
    // Snapshot + clear so newcomers can queue again while we're awaiting.
    const hrefs = Array.from(queue)
    queue.clear()
    isFetching.value = true
    try {
      // Chunk into <= 50-href batches.
      for (let i = 0; i < hrefs.length; i += FLUSH_BATCH_SIZE) {
        const chunk = hrefs.slice(i, i + FLUSH_BATCH_SIZE)
        const res = await apiIndexStatus(chunk.map((href) => ({ href })))
        const items = res.items ?? {}
        const next = new Map(statuses.value)
        for (const href of chunk) {
          next.set(href, classify(items[href]))
        }
        statuses.value = next
      }
    } catch {
      // On failure, mark every href in this batch as 'unknown' so we don't
      // silently spin forever; the next observe() will retry naturally.
      const next = new Map(statuses.value)
      for (const href of hrefs) {
        if (!next.has(href)) next.set(href, { status: 'unknown' })
      }
      statuses.value = next
    } finally {
      isFetching.value = false
    }
  }

  function observe(href: string): void {
    if (!href || statuses.value.has(href) || queue.has(href)) return
    queue.add(href)
    scheduleFlush()
  }

  function unobserve(href: string): void {
    queue.delete(href)
  }

  onScopeDispose(() => {
    if (flushTimer !== null) {
      clearTimeout(flushTimer)
      flushTimer = null
    }
    queue.clear()
  })

  return { observe, unobserve, statuses, isFetching, flushNow }
}
