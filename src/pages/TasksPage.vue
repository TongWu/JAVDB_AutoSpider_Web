<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { NCard, NAlert } from 'naive-ui'
import TaskFilters from '@/components/tasks/TaskFilters.vue'
import TaskTable from '@/components/tasks/TaskTable.vue'
import TaskDrawer from '@/components/tasks/TaskDrawer.vue'
import { useTasksStore } from '@/stores/tasks'
import { useSharedPolling } from '@/composables/useSharedPolling'
import type { TaskItem } from '@/api/tasks'

const { t } = useI18n()
const route = useRoute()
const tasks = useTasksStore()

const drawerOpen = ref(false)
const selected = ref<TaskItem | null>(null)
const highlightJobId = computed(() => (route.query.highlight as string) ?? null)

function openDrawer(task: TaskItem) {
  selected.value = task
  drawerOpen.value = true
}

onMounted(async () => {
  await tasks.fetchList()
  // If highlight present, auto-open the drawer for that task
  if (highlightJobId.value) {
    const found = tasks.items.find((t) => t.job_id === highlightJobId.value)
    if (found) openDrawer(found)
  }
})

// Poll every 5s while any task is running. Only the leader tab polls; others skip.
useSharedPolling(async () => {
  if (tasks.hasRunningTask) {
    await tasks.fetchList()
  }
}, { channelName: 'tasks-poll', intervalMs: 5000, immediate: false })

watch(highlightJobId, (id) => {
  if (id && tasks.items.length > 0) {
    const found = tasks.items.find((t) => t.job_id === id)
    if (found) openDrawer(found)
  }
})
</script>

<template>
  <div class="tasks-page">
    <header class="page-header">
      <h1>{{ t('nav.tasks') }}</h1>
      <p class="subtitle">
        {{ t('tasks.subtitle') }}
      </p>
    </header>

    <TaskFilters />

    <NAlert
      v-if="tasks.error"
      type="error"
      :title="t('errors.generic.title')"
      closable
    >
      {{ tasks.error instanceof Error ? tasks.error.message : String(tasks.error) }}
    </NAlert>

    <NCard>
      <TaskTable
        :items="tasks.filteredItems"
        :loading="tasks.loading"
        :highlighted-job-id="highlightJobId"
        @select-row="openDrawer"
      />
    </NCard>

    <TaskDrawer
      v-model:show="drawerOpen"
      :task="selected"
    />
  </div>
</template>

<style scoped>
.tasks-page { display: flex; flex-direction: column; gap: 16px; }
.page-header h1 { margin: 0; font-size: 22px; font-weight: 700; }
.subtitle { color: var(--n-text-color-2); font-size: 13px; margin-top: 4px; }
</style>
