<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NCard,
  NAlert,
  NDataTable,
  NButton,
  NInput,
  NSelect,
  NSpace,
  NTag,
  type DataTableColumns,
  type SelectOption,
} from 'naive-ui'
import {
  sendTestEmail,
  getEmailHistory,
  resendEmail,
  type EmailHistoryItem,
  type EmailTestResponse,
} from '@/api/operations'

const { t } = useI18n()

// ── Send test email state ───────────────────────────────────────────
const recipient = ref('')
const sendLoading = ref(false)
const sendError = ref<string | null>(null)
const sendResult = ref<EmailTestResponse | null>(null)

async function handleSendTest() {
  sendLoading.value = true
  sendError.value = null
  sendResult.value = null
  try {
    sendResult.value = await sendTestEmail(
      recipient.value ? { recipient: recipient.value } : {},
    )
  } catch (e) {
    sendError.value = e instanceof Error ? e.message : String(e)
  } finally {
    sendLoading.value = false
  }
}

// ── Email history state ─────────────────────────────────────────────
const history = ref<EmailHistoryItem[]>([])
const historyLoading = ref(false)
const historyError = ref<string | null>(null)
const statusFilter = ref<string | null>(null)
const resendingId = ref<number | null>(null)

const statusOptions = computed<SelectOption[]>(() => [
  { label: t('ops.email.statusAll'), value: '' },
  { label: t('ops.email.statusSent'), value: 'sent' },
  { label: t('ops.email.statusFailed'), value: 'failed' },
  { label: t('ops.email.statusResent'), value: 'resent' },
])

async function fetchHistory() {
  historyLoading.value = true
  historyError.value = null
  try {
    const params: { status?: string } = {}
    if (statusFilter.value) params.status = statusFilter.value
    const res = await getEmailHistory(params)
    history.value = res.items
  } catch (e) {
    historyError.value = e instanceof Error ? e.message : String(e)
  } finally {
    historyLoading.value = false
  }
}

async function handleResend(id: number) {
  resendingId.value = id
  try {
    await resendEmail(id)
    await fetchHistory()
  } catch (e) {
    historyError.value = e instanceof Error ? e.message : String(e)
  } finally {
    resendingId.value = null
  }
}

onMounted(() => fetchHistory())

// ── Helpers ─────────────────────────────────────────────────────────
function emailStatusType(status: string | null): 'success' | 'info' | 'warning' | 'error' | 'default' {
  if (!status) return 'default'
  if (status === 'sent') return 'success'
  if (status === 'resent') return 'info'
  if (status === 'failed') return 'error'
  return 'default'
}

// ── History table columns ───────────────────────────────────────────
const historyColumns = computed<DataTableColumns<EmailHistoryItem>>(() => [
  {
    title: t('ops.email.col.subject'),
    key: 'subject',
    ellipsis: { tooltip: true },
    minWidth: 200,
    render: (row) => row.subject || '—',
  },
  {
    title: t('ops.email.col.recipient'),
    key: 'recipient',
    width: 180,
    render: (row) => row.recipient || '—',
  },
  {
    title: t('ops.email.col.status'),
    key: 'status',
    width: 100,
    render: (row) =>
      h(
        NTag,
        { size: 'small', round: true, type: emailStatusType(row.status) },
        () => row.status || '—',
      ),
  },
  {
    title: t('ops.email.col.sentAt'),
    key: 'sent_at',
    width: 170,
    render: (row) => row.sent_at || '—',
  },
  {
    title: t('ops.email.col.error'),
    key: 'error_message',
    ellipsis: { tooltip: true },
    width: 180,
    render: (row) => row.error_message || '—',
  },
  {
    title: t('ops.email.col.action'),
    key: 'action',
    width: 100,
    render: (row) => {
      if (row.status === 'failed') {
        return h(
          NButton,
          {
            size: 'tiny',
            type: 'warning',
            loading: resendingId.value === row.id,
            onClick: () => handleResend(row.id),
          },
          () => t('ops.email.resend'),
        )
      }
      return '—'
    },
  },
])
</script>

<template>
  <div class="email-page">
    <header class="page-header">
      <div class="page-header-left">
        <h1>{{ t('nav.email') }}</h1>
        <p class="subtitle">
          {{ t('ops.email.subtitle') }}
        </p>
      </div>
    </header>

    <!-- Send Test Email -->
    <NCard :title="t('ops.email.sendTest')">
      <NSpace
        align="center"
        :wrap="true"
        :size="16"
      >
        <NInput
          v-model:value="recipient"
          :placeholder="t('ops.email.recipientPlaceholder')"
          size="small"
          style="width: 280px"
          clearable
        />
        <NButton
          type="primary"
          size="small"
          :loading="sendLoading"
          @click="handleSendTest"
        >
          {{ t('ops.email.sendButton') }}
        </NButton>
      </NSpace>

      <NAlert
        v-if="sendError"
        type="error"
        :title="t('errors.generic.title')"
        closable
        style="margin-top: 12px"
        @close="sendError = null"
      >
        {{ sendError }}
      </NAlert>

      <NAlert
        v-if="sendResult"
        :type="sendResult.success ? 'success' : 'error'"
        closable
        style="margin-top: 12px"
        @close="sendResult = null"
      >
        {{ sendResult.message }}
      </NAlert>
    </NCard>

    <!-- Notification History -->
    <NCard :title="t('ops.email.history')">
      <template #header-extra>
        <NSpace :size="8">
          <NSelect
            v-model:value="statusFilter"
            :options="statusOptions"
            size="small"
            style="width: 140px"
            @update:value="fetchHistory"
          />
          <NButton
            size="small"
            :loading="historyLoading"
            @click="fetchHistory"
          >
            {{ t('common.retry') }}
          </NButton>
        </NSpace>
      </template>

      <NAlert
        v-if="historyError"
        type="error"
        :title="t('errors.generic.title')"
        closable
        style="margin-bottom: 12px"
        @close="historyError = null"
      >
        {{ historyError }}
      </NAlert>

      <NDataTable
        :columns="historyColumns"
        :data="history"
        :loading="historyLoading"
        :row-key="(row: EmailHistoryItem) => row.id"
        striped
        :max-height="420"
      />
    </NCard>
  </div>
</template>

<style scoped>
.email-page {
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
</style>
