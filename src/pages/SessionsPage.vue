<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { NCard, NAlert, NMessageProvider } from 'naive-ui'
import SessionFilters from '@/components/sessions/SessionFilters.vue'
import SessionTable from '@/components/sessions/SessionTable.vue'
import SessionDrawer from '@/components/sessions/SessionDrawer.vue'
import RollbackDialog from '@/components/sessions/RollbackDialog.vue'
import CommitDialog from '@/components/sessions/CommitDialog.vue'
import { useSessionsStore } from '@/stores/sessions'
import { usePolling } from '@/composables/usePolling'
import type { SessionItem } from '@/api/sessions'

const { t } = useI18n()
const sessions = useSessionsStore()

const drawerOpen = ref(false)
const selected = ref<SessionItem | null>(null)
const rollbackOpen = ref(false)
const commitOpen = ref(false)

function openDrawer(session: SessionItem): void {
  selected.value = session
  drawerOpen.value = true
}

function onRollback(session: SessionItem): void {
  selected.value = session
  rollbackOpen.value = true
}

function onCommit(session: SessionItem): void {
  selected.value = session
  commitOpen.value = true
}

async function onRollbackApplied(): Promise<void> {
  if (selected.value?.session_id) {
    sessions.invalidateDetail(selected.value.session_id)
  }
  drawerOpen.value = false
  await sessions.refresh()
}

async function onCommitted(): Promise<void> {
  if (selected.value?.session_id) {
    sessions.invalidateDetail(selected.value.session_id)
  }
  drawerOpen.value = false
  await sessions.refresh()
}

onMounted(async () => {
  await sessions.fetchList()
})

usePolling(
  async () => {
    if (sessions.hasActiveSession) {
      await sessions.fetchList()
    }
  },
  { intervalMs: 10000, immediate: false },
)
</script>

<template>
  <NMessageProvider>
    <div class="sessions-page">
      <header class="page-header">
        <h1>{{ t('nav.sessions') }}</h1>
        <p class="subtitle">
          {{ t('sessions.subtitle') }}
        </p>
      </header>

      <SessionFilters />

      <NAlert
        v-if="sessions.error"
        type="error"
        :title="t('errors.generic.title')"
        closable
      >
        {{ sessions.error instanceof Error ? sessions.error.message : String(sessions.error) }}
      </NAlert>

      <NCard>
        <SessionTable
          :items="sessions.filteredItems"
          :loading="sessions.loading"
          @select-row="openDrawer"
        />
      </NCard>

      <SessionDrawer
        v-model:show="drawerOpen"
        :session="selected"
        @rollback="onRollback"
        @commit="onCommit"
      />

      <RollbackDialog
        v-model:show="rollbackOpen"
        :session-id="selected?.session_id ?? null"
        @applied="onRollbackApplied"
      />

      <CommitDialog
        v-model:show="commitOpen"
        :session-id="selected?.session_id ?? null"
        @committed="onCommitted"
      />
    </div>
  </NMessageProvider>
</template>

<style scoped>
.sessions-page { display: flex; flex-direction: column; gap: 16px; }
.page-header h1 { margin: 0; font-size: 22px; font-weight: 700; }
.subtitle { color: var(--n-text-color-2); font-size: 13px; margin-top: 4px; }
</style>
