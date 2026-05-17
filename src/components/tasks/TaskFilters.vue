<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { NSpace, NSelect, NInput, NDatePicker, NButton } from 'naive-ui'
import { useTasksStore } from '@/stores/tasks'

const { t } = useI18n()
const tasks = useTasksStore()

const statusOptions = computed(() => [
  { label: t('tasks.status.running'), value: 'running' },
  { label: t('tasks.status.success'), value: 'success' },
  { label: t('tasks.status.failed'), value: 'failed' },
  { label: t('tasks.status.cancelled'), value: 'cancelled' },
])

const modeOptions = computed(() => [
  { label: t('tasks.mode.all'), value: '' },
  { label: t('tasks.mode.local'), value: 'local' },
  { label: t('tasks.mode.github'), value: 'github' },
])

const dateRange = computed<[number, number] | null>({
  get() {
    if (tasks.filters.dateFrom != null && tasks.filters.dateTo != null) {
      return [tasks.filters.dateFrom, tasks.filters.dateTo]
    }
    return null
  },
  set(val) {
    if (val) {
      tasks.setFilter('dateFrom', val[0])
      tasks.setFilter('dateTo', val[1])
    } else {
      tasks.setFilter('dateFrom', null)
      tasks.setFilter('dateTo', null)
    }
  },
})

function reset() {
  tasks.resetFilters()
}
</script>

<template>
  <NSpace align="center" :size="12">
    <NSelect
      multiple
      clearable
      :value="tasks.filters.status"
      :options="statusOptions"
      :placeholder="t('tasks.filters.statusPlaceholder')"
      style="min-width: 200px"
      @update:value="(v: string[]) => tasks.setFilter('status', v)"
    />
    <NSelect
      clearable
      :value="tasks.filters.mode"
      :options="modeOptions"
      :placeholder="t('tasks.filters.modePlaceholder')"
      style="min-width: 160px"
      @update:value="(v: string) => tasks.setFilter('mode', v || null)"
    />
    <NDatePicker
      v-model:value="dateRange"
      type="daterange"
      clearable
      style="min-width: 280px"
    />
    <NInput
      :value="tasks.filters.search"
      clearable
      :placeholder="t('tasks.filters.searchPlaceholder')"
      style="min-width: 200px"
      @update:value="(v: string) => tasks.setFilter('search', v)"
    />
    <NButton tertiary size="small" @click="reset">{{ t('tasks.filters.reset') }}</NButton>
  </NSpace>
</template>
