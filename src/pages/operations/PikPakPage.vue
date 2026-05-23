<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NCard,
  NAlert,
  NDataTable,
  NButton,
  NInputNumber,
  NSpace,
  NSwitch,
  NTag,
  type DataTableColumns,
} from 'naive-ui'
import {
  getPikPakQueue,
  transferPikPak,
  type PikPakQueueItem,
  type PikPakTransferResponse,
} from '@/api/operations'

const { t } = useI18n()

// ── Queue state ─────────────────────────────────────────────────────
const queue = ref<PikPakQueueItem[]>([])
const queueLoading = ref(false)
const queueError = ref<string | null>(null)
const queueTotal = ref(0)

async function fetchQueue() {
  queueLoading.value = true
  queueError.value = null
  try {
    const res = await getPikPakQueue()
    queue.value = res.items
    queueTotal.value = res.total
  } catch (e) {
    queueError.value = e instanceof Error ? e.message : String(e)
  } finally {
    queueLoading.value = false
  }
}

// ── Transfer state ──────────────────────────────────────────────────
const transferDays = ref(7)
const dryRun = ref(true)
const transferLoading = ref(false)
const transferError = ref<string | null>(null)
const transferResult = ref<PikPakTransferResponse | null>(null)

async function runTransfer() {
  transferLoading.value = true
  transferError.value = null
  transferResult.value = null
  try {
    transferResult.value = await transferPikPak({
      days: transferDays.value,
      dry_run: dryRun.value,
    })
  } catch (e) {
    transferError.value = e instanceof Error ? e.message : String(e)
  } finally {
    transferLoading.value = false
  }
}

onMounted(() => fetchQueue())

// ── Helpers ─────────────────────────────────────────────────────────
function statusType(status: string | null): 'success' | 'info' | 'warning' | 'error' | 'default' {
  if (!status) return 'default'
  if (status === 'completed' || status === 'success') return 'success'
  if (status === 'pending' || status === 'queued') return 'info'
  if (status === 'skipped') return 'warning'
  if (status === 'failed' || status === 'error') return 'error'
  return 'default'
}

// ── Queue table columns ─────────────────────────────────────────────
const queueColumns = computed<DataTableColumns<PikPakQueueItem>>(() => [
  {
    title: t('ops.pikpak.col.name'),
    key: 'torrent_name',
    ellipsis: { tooltip: true },
    minWidth: 200,
    render: (row) => row.torrent_name || '—',
  },
  {
    title: t('ops.pikpak.col.category'),
    key: 'category',
    width: 120,
    render: (row) => row.category || '—',
  },
  {
    title: t('ops.pikpak.col.status'),
    key: 'transfer_status',
    width: 120,
    render: (row) =>
      h(
        NTag,
        { size: 'small', round: true, type: statusType(row.transfer_status) },
        () => row.transfer_status || '—',
      ),
  },
  {
    title: t('ops.pikpak.col.error'),
    key: 'error_message',
    ellipsis: { tooltip: true },
    width: 180,
    render: (row) => row.error_message || '—',
  },
  {
    title: t('ops.pikpak.col.addedOn'),
    key: 'datetime_added_to_qb',
    width: 170,
    render: (row) => row.datetime_added_to_qb || '—',
  },
])

// ── Transfer detail columns ─────────────────────────────────────────
const transferDetailColumns = computed<DataTableColumns<Record<string, unknown>>>(() => [
  {
    title: t('ops.pikpak.col.name'),
    key: 'name',
    ellipsis: { tooltip: true },
    minWidth: 200,
    render: (row) => String(row.name ?? row.torrent_name ?? '—'),
  },
  {
    title: t('ops.pikpak.col.status'),
    key: 'status',
    width: 120,
    render: (row) => String(row.status ?? row.action ?? '—'),
  },
])
</script>

<template>
  <div class="pikpak-page">
    <header class="page-header">
      <div class="page-header-left">
        <h1>{{ t('nav.pikpak') }}</h1>
        <p class="subtitle">
          {{ t('ops.pikpak.subtitle') }}
        </p>
      </div>
    </header>

    <!-- Transfer Queue -->
    <NCard :title="t('ops.pikpak.transferQueue')">
      <template #header-extra>
        <NSpace :size="8">
          <span class="item-count">{{ t('ops.pikpak.total', { count: queueTotal }) }}</span>
          <NButton
            size="small"
            :loading="queueLoading"
            @click="fetchQueue"
          >
            {{ t('common.retry') }}
          </NButton>
        </NSpace>
      </template>

      <NAlert
        v-if="queueError"
        type="error"
        :title="t('errors.generic.title')"
        closable
        style="margin-bottom: 12px"
        @close="queueError = null"
      >
        {{ queueError }}
      </NAlert>

      <NDataTable
        :columns="queueColumns"
        :data="queue"
        :loading="queueLoading"
        :row-key="(row: PikPakQueueItem) => row.id"
        striped
        :max-height="420"
      />
    </NCard>

    <!-- Batch Transfer -->
    <NCard :title="t('ops.pikpak.batchTransfer')">
      <NSpace
        align="center"
        :wrap="true"
        :size="16"
      >
        <NSpace
          align="center"
          :size="6"
        >
          <span class="form-label">{{ t('ops.pikpak.days') }}</span>
          <NInputNumber
            v-model:value="transferDays"
            :min="1"
            :max="365"
            size="small"
            style="width: 100px"
          />
        </NSpace>
        <NSpace
          align="center"
          :size="6"
        >
          <span class="form-label">{{ t('ops.pikpak.dryRun') }}</span>
          <NSwitch v-model:value="dryRun" />
        </NSpace>
        <NButton
          type="primary"
          size="small"
          :loading="transferLoading"
          @click="runTransfer"
        >
          {{ t('ops.pikpak.runTransfer') }}
        </NButton>
      </NSpace>

      <NAlert
        v-if="transferError"
        type="error"
        :title="t('errors.generic.title')"
        closable
        style="margin-top: 12px"
        @close="transferError = null"
      >
        {{ transferError }}
      </NAlert>

      <div
        v-if="transferResult"
        class="transfer-result"
      >
        <NSpace :size="24">
          <div class="stat-block">
            <span class="stat-label">{{ t('ops.pikpak.transferred') }}</span>
            <span class="stat-value">{{ transferResult.transferred ?? 0 }}</span>
          </div>
          <div class="stat-block">
            <span class="stat-label">{{ t('ops.pikpak.failed') }}</span>
            <span class="stat-value">{{ transferResult.failed ?? 0 }}</span>
          </div>
          <div class="stat-block">
            <span class="stat-label">{{ t('ops.pikpak.skipped') }}</span>
            <span class="stat-value">{{ transferResult.skipped ?? 0 }}</span>
          </div>
          <div class="stat-block">
            <span class="stat-label">{{ t('ops.pikpak.dryRun') }}</span>
            <NTag
              size="small"
              :type="transferResult.dry_run ? 'warning' : 'success'"
            >
              {{ transferResult.dry_run ? t('common.yes') : t('common.no') }}
            </NTag>
          </div>
        </NSpace>

        <NDataTable
          v-if="transferResult.details.length > 0"
          :columns="transferDetailColumns"
          :data="transferResult.details"
          :row-key="(row: Record<string, unknown>) => JSON.stringify(row)"
          striped
          style="margin-top: 12px"
          :max-height="300"
        />
      </div>
    </NCard>
  </div>
</template>

<style scoped>
.pikpak-page {
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
.item-count {
  font-size: 13px;
  color: var(--n-text-color-3);
}
.form-label {
  font-size: 13px;
  white-space: nowrap;
}
.transfer-result {
  margin-top: 16px;
}
.stat-block {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.stat-label {
  font-size: 12px;
  color: var(--n-text-color-3);
}
.stat-value {
  font-size: 18px;
  font-weight: 600;
}
</style>
