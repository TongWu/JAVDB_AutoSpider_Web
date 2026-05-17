import { ref, watchEffect } from 'vue'
import { type AxiosResponse } from 'axios'

export interface UseApiOptions<T> {
  defaultData?: T
}

export function useApi<T>(
  fn: () => Promise<AxiosResponse<T>> | Promise<T>,
  opts: UseApiOptions<T> = {},
) {
  const data = ref<T | undefined>(opts.defaultData)
  const error = ref<unknown>(null)
  const isLoading = ref(false)

  async function refresh() {
    isLoading.value = true
    error.value = null
    try {
      const result = await fn()
      // Allow fn() to return either the raw axios response or just the body
      data.value = (result as AxiosResponse<T>)?.data !== undefined
        ? (result as AxiosResponse<T>).data
        : (result as T)
    } catch (err) {
      error.value = err
    } finally {
      isLoading.value = false
    }
  }

  watchEffect(() => {
    void refresh()
  })

  return { data, error, isLoading, refresh }
}
