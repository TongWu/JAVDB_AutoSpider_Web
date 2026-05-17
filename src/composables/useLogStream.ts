import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRunsStore } from '@/stores/runs'
import { apiGetTaskStream } from '@/api/tasks'
import { usePolling } from './usePolling'

export function useLogStream(jobId: () => string) {
  const runs = useRunsStore()
  const stream = computed(() => runs.getStream(jobId()))
  const error = ref<unknown>(null)

  async function fetchOnce() {
    const id = jobId()
    if (!id) return
    let s = runs.getStream(id)
    if (!s) {
      s = runs.startStream(id)
    }
    if (s.done) return
    try {
      const chunk = await apiGetTaskStream(id, s.offset)
      const newOffset = typeof chunk.offset === 'number' ? chunk.offset : s.offset
      let newLines: string[] = []
      if (Array.isArray(chunk.lines)) {
        newLines = chunk.lines
      } else if (typeof chunk.log === 'string' && chunk.log.length > 0) {
        newLines = chunk.log.split('\n').filter((l) => l.length > 0)
      }
      if (newLines.length > 0) runs.appendLines(id, newLines, newOffset)
      if (chunk.status) runs.updateStream(id, { status: chunk.status })
      if (chunk.done === true || (chunk.status && ['success', 'failed', 'completed', 'error'].includes(String(chunk.status).toLowerCase()))) {
        runs.endStream(id)
      }
    } catch (err) {
      error.value = err
      console.error('Log stream fetch failed:', err)
    }
  }

  const { start, stop, tick } = usePolling(fetchOnce, {
    intervalMs: 2000,
    immediate: true,
    enabled: () => {
      const s = runs.getStream(jobId())
      return s ? !s.done : true
    },
  })

  // If the jobId changes, reset
  watch(jobId, () => {
    void tick()
  })

  onBeforeUnmount(() => stop())

  return { stream, error, fetchNow: tick, start, stop }
}
