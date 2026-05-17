import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'

export interface ActiveStream {
  jobId: string
  startedAt: number
  status: string
  lines: string[]
  offset: number
  done: boolean
}

export const useRunsStore = defineStore('runs', () => {
  const streams = reactive(new Map<string, ActiveStream>())
  const activeIds = ref<string[]>([])

  function startStream(jobId: string): ActiveStream {
    if (!streams.has(jobId)) {
      streams.set(jobId, {
        jobId,
        startedAt: Date.now(),
        status: 'pending',
        lines: [],
        offset: 0,
        done: false,
      })
      if (!activeIds.value.includes(jobId)) activeIds.value.push(jobId)
    }
    return streams.get(jobId)!
  }

  function updateStream(jobId: string, patch: Partial<ActiveStream>) {
    const existing = streams.get(jobId)
    if (existing) {
      Object.assign(existing, patch)
    }
  }

  function appendLines(jobId: string, lines: string[], newOffset: number) {
    const existing = streams.get(jobId)
    if (existing) {
      existing.lines = [...existing.lines, ...lines]
      existing.offset = newOffset
    }
  }

  function getStream(jobId: string): ActiveStream | undefined {
    return streams.get(jobId)
  }

  function endStream(jobId: string) {
    const existing = streams.get(jobId)
    if (existing) {
      existing.done = true
    }
  }

  function removeStream(jobId: string) {
    streams.delete(jobId)
    activeIds.value = activeIds.value.filter((id) => id !== jobId)
  }

  return { streams, activeIds, startStream, updateStream, appendLines, getStream, endStream, removeStream }
})
