import { onBeforeUnmount, onMounted, ref } from 'vue'
import { usePolling, type PollingOptions } from './usePolling'

export interface SharedPollingOptions extends PollingOptions {
  /** BroadcastChannel name — unique per data domain (e.g. 'tasks-poll') */
  channelName: string
}

/**
 * Wraps usePolling with BroadcastChannel leader election so only one browser
 * tab polls the backend at a time.
 *
 * Leader election: each tab generates a random tabId; the lexicographically
 * smallest ID wins. When a new tab opens it broadcasts a `claim`; any
 * existing leader with a higher ID yields. When the leader unloads it
 * broadcasts `release` so remaining tabs can re-elect.
 *
 * Fallback: if BroadcastChannel is unavailable (SSR / old browsers) the
 * composable behaves identically to plain usePolling.
 */
export function useSharedPolling(
  fn: () => Promise<void> | void,
  opts: SharedPollingOptions,
) {
  if (typeof BroadcastChannel === 'undefined') {
    return usePolling(fn, opts)
  }

  const tabId = Math.random().toString(36).slice(2)
  const isLeader = ref(false)
  const channel = new BroadcastChannel(opts.channelName)
  let currentLeader: string | null = null

  // The polling loop only actually calls fn() when this tab is the leader.
  const polling = usePolling(
    async () => {
      if (!isLeader.value) return
      await fn()
      channel.postMessage({ type: 'heartbeat', tabId })
    },
    { ...opts, immediate: false },
  )

  function claimLeadership() {
    isLeader.value = true
    currentLeader = tabId
    channel.postMessage({ type: 'claim', tabId })
    polling.start()
  }

  function yieldLeadership(leaderId: string) {
    if (isLeader.value) {
      polling.stop()
    }
    isLeader.value = false
    currentLeader = leaderId
  }

  channel.onmessage = (event: MessageEvent) => {
    const msg = event.data as { type: string; tabId: string }

    if (msg.type === 'claim') {
      if (msg.tabId < tabId) {
        // Incoming tab has lower ID → it wins, we yield
        yieldLeadership(msg.tabId)
      } else if (msg.tabId > tabId && isLeader.value) {
        // We have lower ID → re-assert our claim
        channel.postMessage({ type: 'claim', tabId })
      }
    } else if (msg.type === 'heartbeat') {
      if (msg.tabId !== tabId) {
        currentLeader = msg.tabId
        // If we're also polling (shouldn't happen, but guard against split-brain)
        if (isLeader.value && msg.tabId < tabId) {
          yieldLeadership(msg.tabId)
        }
      }
    } else if (msg.type === 'release') {
      if (msg.tabId === currentLeader) {
        // The current leader is gone — claim leadership
        claimLeadership()
      }
    }
  }

  onMounted(() => {
    claimLeadership()
    // Run an immediate fetch regardless of leadership so the local tab
    // has data on first render — matches `immediate: true` semantics.
    if (opts.immediate) {
      void fn()
    }
  })

  onBeforeUnmount(() => {
    // Close the channel BEFORE broadcasting release so this tab no longer
    // receives the re-claim messages that other tabs will fire in response.
    // We still postMessage first because close() only prevents receiving —
    // outgoing delivery happens synchronously before the channel object is
    // removed from the shared set in our mock (and natively).
    const wasLeader = isLeader.value
    // Stop polling and mark as leaving so the onmessage handler ignores
    // any incoming messages triggered by our own release broadcast.
    isLeader.value = false
    polling.stop()
    // Remove ourselves from the channel before broadcasting, so that any
    // synchronous claim messages fired in response are not received by us.
    channel.close()
    if (wasLeader) {
      // Re-open a temporary channel just long enough to send the release,
      // then immediately close it. This avoids receiving re-claims.
      const tmp = new BroadcastChannel(opts.channelName)
      tmp.postMessage({ type: 'release', tabId })
      tmp.close()
    }
  })

  return { isLeader, ...polling }
}
