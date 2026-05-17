import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { apiListTasks, type TaskItem, type ListTasksResponse } from '@/api/tasks'

export type TaskStatusFilter = string  // 'running' | 'completed' | 'failed' | etc.

export interface TaskFilters {
  status: string[]    // multi-select
  mode: string | null
  search: string
  dateFrom: number | null  // epoch ms
  dateTo: number | null
}

export const useTasksStore = defineStore('tasks', () => {
  const items = ref<TaskItem[]>([])
  const total = ref<number | undefined>(undefined)
  const loading = ref(false)
  const error = ref<unknown>(null)
  const filters = ref<TaskFilters>({
    status: [],
    mode: null,
    search: '',
    dateFrom: null,
    dateTo: null,
  })

  const hasRunningTask = computed(() =>
    items.value.some((t) => String(t.status ?? '').toLowerCase() === 'running')
  )

  const filteredItems = computed(() => {
    let list = items.value
    if (filters.value.status.length > 0) {
      list = list.filter((t) => filters.value.status.includes(String(t.status ?? '')))
    }
    if (filters.value.mode) {
      list = list.filter((t) => String(t.mode ?? '').toLowerCase() === filters.value.mode!.toLowerCase())
    }
    if (filters.value.search.trim()) {
      const q = filters.value.search.toLowerCase()
      list = list.filter((t) =>
        String(t.job_id ?? '').toLowerCase().includes(q) ||
        String(t.mode ?? '').toLowerCase().includes(q),
      )
    }
    if (filters.value.dateFrom != null) {
      list = list.filter((t) => {
        const ts = t.started_at ? new Date(t.started_at as string).getTime() : NaN
        return !isNaN(ts) && ts >= filters.value.dateFrom!
      })
    }
    if (filters.value.dateTo != null) {
      list = list.filter((t) => {
        const ts = t.started_at ? new Date(t.started_at as string).getTime() : NaN
        return !isNaN(ts) && ts <= filters.value.dateTo!
      })
    }
    return list
  })

  async function fetchList(limit = 200): Promise<TaskItem[]> {
    loading.value = true
    error.value = null
    try {
      const resp: ListTasksResponse = await apiListTasks(limit)
      const list = resp.tasks ?? resp.items ?? []
      items.value = list
      total.value = resp.total
      return list
    } catch (err) {
      error.value = err
      throw err
    } finally {
      loading.value = false
    }
  }

  function setFilter<K extends keyof TaskFilters>(key: K, value: TaskFilters[K]) {
    filters.value = { ...filters.value, [key]: value }
  }

  function resetFilters() {
    filters.value = { status: [], mode: null, search: '', dateFrom: null, dateTo: null }
  }

  return {
    items,
    total,
    loading,
    error,
    filters,
    hasRunningTask,
    filteredItems,
    fetchList,
    setFilter,
    resetFilters,
  }
})
