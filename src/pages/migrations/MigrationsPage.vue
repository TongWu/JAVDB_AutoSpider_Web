<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import {
  NAlert,
  NBadge,
  NButton,
  NCard,
  NDataTable,
  NDrawer,
  NDrawerContent,
  NTag,
  NTooltip,
  type DataTableColumns,
} from 'naive-ui'
import { listMigrations, runMigration, type MigrationItem } from '@/api/migrations'
import { useAuthStore } from '@/stores/auth'

const { t } = useI18n()
const router = useRouter()
const auth = useAuthStore()

// ── Access guard ─────────────────────────────────────────────────────
onMounted(() => {
  if (!auth.hasRole('admin')) {
    void router.replace('/403')
    return
  }
  void fetchMigrations()
})

// ── Data ──────────────────────────────────────────────────────────────
const migrations = ref<MigrationItem[]>([])
const loading = ref(false)
const fetchError = ref<string | null>(null)

async function fetchMigrations() {
  loading.value = true
  fetchError.value = null
  try {
    const res = await listMigrations()
    migrations.value = res.migrations
  } catch (e) {
    fetchError.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

const unappliedCount = computed(() => migrations.value.filter((m) => !m.applied).length)

// ── Drawer / preview ──────────────────────────────────────────────────
const drawerOpen = ref(false)
const drawerMigration = ref<MigrationItem | null>(null)
const previewLoading = ref(false)
const previewError = ref<string | null>(null)
const previewSql = ref<string | null>(null)
const previewStatements = ref<number>(0)

async function openPreview(row: MigrationItem) {
  drawerMigration.value = row
  drawerOpen.value = true
  previewError.value = null
  previewSql.value = null
  previewStatements.value = 0
  previewLoading.value = true
  try {
    const res = await runMigration(row.id, true)
    previewSql.value = res.sql_preview
    previewStatements.value = res.statements
  } catch (e) {
    previewError.value = e instanceof Error ? e.message : String(e)
  } finally {
    previewLoading.value = false
  }
}

// ── Table columns ─────────────────────────────────────────────────────
const columns = computed<DataTableColumns<MigrationItem>>(() => [
  {
    title: t('migrations.col.filename'),
    key: 'filename',
    ellipsis: { tooltip: true },
  },
  {
    title: t('migrations.col.status'),
    key: 'applied',
    width: 110,
    render: (row) =>
      h(
        NTag,
        { type: row.applied ? 'success' : 'default', size: 'small' },
        () => (row.applied ? t('migrations.status.applied') : t('migrations.status.pending')),
      ),
  },
  {
    title: t('migrations.col.appliedAt'),
    key: 'applied_at',
    width: 180,
    render: (row) =>
      row.applied_at ? new Date(row.applied_at).toLocaleString() : '—',
  },
  {
    title: '',
    key: 'actions',
    width: 90,
    render: (row) => {
      if (row.applied) return null
      return h(
        NButton,
        {
          size: 'tiny',
          onClick: () => openPreview(row),
        },
        () => t('migrations.preview'),
      )
    },
  },
])
</script>

<template>
  <div class="migrations-page">
    <header class="page-header">
      <div class="page-header-left">
        <h1>
          {{ t('nav.migrations') }}
          <NBadge
            v-if="unappliedCount > 0"
            :value="t('migrations.unappliedCount', { n: unappliedCount })"
            type="warning"
            style="margin-left: 10px; vertical-align: middle;"
          />
        </h1>
        <p class="subtitle">
          {{ t('migrations.subtitle') }}
        </p>
      </div>
      <NButton
        size="small"
        :loading="loading"
        @click="fetchMigrations"
      >
        {{ t('common.retry') }}
      </NButton>
    </header>

    <NAlert
      v-if="fetchError"
      type="error"
      closable
      style="margin-bottom: 16px"
      @close="fetchError = null"
    >
      {{ fetchError }}
    </NAlert>

    <NCard size="small">
      <NDataTable
        :columns="columns"
        :data="migrations"
        :loading="loading"
        :row-key="(row: MigrationItem) => row.id"
        striped
      />
    </NCard>

    <!-- SQL Preview Drawer -->
    <NDrawer
      v-model:show="drawerOpen"
      :width="600"
      placement="right"
    >
      <NDrawerContent
        :title="t('migrations.previewTitle')"
        closable
      >
        <div class="drawer-body">
          <NAlert
            v-if="previewError"
            type="error"
            style="margin-bottom: 12px"
          >
            {{ previewError }}
          </NAlert>

          <p
            v-if="!previewLoading && previewSql !== null"
            class="statements-hint"
          >
            {{ t('migrations.statements', { n: previewStatements }) }}
          </p>

          <pre
            v-if="previewSql !== null"
            class="sql-preview"
          >{{ previewSql }}</pre>

          <p
            v-if="previewLoading"
            class="loading-hint"
          >
            {{ t('common.loading') }}
          </p>
        </div>

        <template #footer>
          <NTooltip>
            <template #trigger>
              <NButton
                type="primary"
                size="small"
                disabled
              >
                Apply
              </NButton>
            </template>
            {{ t('migrations.applyDisabled') }}
          </NTooltip>
        </template>
      </NDrawerContent>
    </NDrawer>
  </div>
</template>

<style scoped>
.migrations-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.page-header-left h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
}

.subtitle {
  color: var(--n-text-color-2);
  font-size: 13px;
  margin-top: 4px;
}

.drawer-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.statements-hint {
  font-size: 13px;
  color: var(--n-text-color-2);
  margin: 0 0 4px;
}

.loading-hint {
  font-size: 13px;
  color: var(--n-text-color-2);
}

.sql-preview {
  font-family: monospace;
  font-size: 12px;
  background: var(--n-code-color);
  border-radius: 4px;
  padding: 12px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
  margin: 0;
}
</style>
