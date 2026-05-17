import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { apiCapabilities, type CapabilitiesResponse } from '@/api/capabilities'

const TTL_MS = 5 * 60 * 1000

export const useCapabilitiesStore = defineStore('capabilities', () => {
  const data = ref<CapabilitiesResponse | null>(null)
  const loadedAt = ref<number | null>(null)
  const loading = ref(false)
  const error = ref<unknown>(null)

  const isStale = computed(() => {
    if (!loadedAt.value) return true
    return Date.now() - loadedAt.value > TTL_MS
  })

  async function fetchInitial(): Promise<CapabilitiesResponse> {
    if (data.value && !isStale.value) return data.value
    return refresh()
  }

  async function refresh(): Promise<CapabilitiesResponse> {
    loading.value = true
    error.value = null
    try {
      const resp = await apiCapabilities()
      data.value = resp
      loadedAt.value = Date.now()
      return resp
    } catch (err) {
      error.value = err
      throw err
    } finally {
      loading.value = false
    }
  }

  function invalidate() {
    loadedAt.value = null
  }

  return { data, loadedAt, loading, error, isStale, fetchInitial, refresh, invalidate }
})
