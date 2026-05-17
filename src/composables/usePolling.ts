import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useDocumentVisibility } from '@vueuse/core'

export interface PollingOptions {
  intervalMs: number
  immediate?: boolean
  enabled?: () => boolean
}

export function usePolling(
  fn: () => Promise<void> | void,
  opts: PollingOptions,
) {
  const visibility = useDocumentVisibility()
  const isRunning = ref(false)
  let timer: ReturnType<typeof setTimeout> | null = null

  function schedule() {
    if (timer != null) clearTimeout(timer)
    timer = setTimeout(tick, opts.intervalMs)
  }

  async function tick() {
    if (visibility.value === 'hidden') {
      schedule()
      return
    }
    if (opts.enabled && !opts.enabled()) {
      schedule()
      return
    }
    try {
      await fn()
    } catch (err) {
      console.error('Polling error:', err)
    } finally {
      if (isRunning.value) schedule()
    }
  }

  function start() {
    if (isRunning.value) return
    isRunning.value = true
    if (opts.immediate) {
      void tick()
    } else {
      schedule()
    }
  }

  function stop() {
    isRunning.value = false
    if (timer != null) {
      clearTimeout(timer)
      timer = null
    }
  }

  // Auto-resume when tab becomes visible again
  watch(visibility, (v) => {
    if (v === 'visible' && isRunning.value) {
      void tick()
    }
  })

  onMounted(() => {
    if (opts.immediate !== false) start()
  })

  onBeforeUnmount(() => stop())

  return { isRunning, start, stop, tick }
}
