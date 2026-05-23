<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NModal,
  NCard,
  NSpace,
  NCheckbox,
  NButton,
  NAlert,
  NDescriptions,
  NDescriptionsItem,
  useMessage,
} from 'naive-ui'
import { apiRollbackSession, type SessionRollbackResponse } from '@/api/sessions'
import { extractErrorMessage } from '@/api/errors'

const props = defineProps<{ show: boolean; sessionId: string | null }>()
const emit = defineEmits<{
  'update:show': [val: boolean]
  applied: [response: SessionRollbackResponse]
}>()

const { t } = useI18n()
const message = useMessage()

const includePending = ref(true)
const preview = ref<SessionRollbackResponse | null>(null)
const previewing = ref(false)
const applying = ref(false)
const errorMsg = ref<string | null>(null)

const visible = computed({
  get: () => props.show,
  set: (v: boolean) => emit('update:show', v),
})

watch(
  () => props.show,
  (open) => {
    if (open) {
      preview.value = null
      errorMsg.value = null
      includePending.value = true
    }
  },
)

async function runPreview(): Promise<void> {
  if (!props.sessionId) return
  previewing.value = true
  errorMsg.value = null
  try {
    preview.value = await apiRollbackSession(props.sessionId, {
      dry_run: true,
      include_pending: includePending.value,
    })
  } catch (err) {
    errorMsg.value = extractErrorMessage(err)
    preview.value = null
  } finally {
    previewing.value = false
  }
}

async function applyRollback(): Promise<void> {
  if (!props.sessionId || !preview.value) return
  applying.value = true
  errorMsg.value = null
  try {
    const resp = await apiRollbackSession(props.sessionId, {
      dry_run: false,
      include_pending: includePending.value,
    })
    message.success(t('sessions.rollback.applied'))
    emit('applied', resp)
    visible.value = false
  } catch (err) {
    errorMsg.value = extractErrorMessage(err)
  } finally {
    applying.value = false
  }
}

function close(): void {
  visible.value = false
}

function formatSummaryEntries(summary: Record<string, unknown>): { label: string; value: string }[] {
  return Object.entries(summary).map(([k, v]) => ({
    label: k,
    value: typeof v === 'object' ? JSON.stringify(v) : String(v),
  }))
}
</script>

<template>
  <NModal
    v-model:show="visible"
    :mask-closable="!previewing && !applying"
  >
    <NCard
      style="max-width: 640px;"
      :title="t('sessions.rollback.title')"
      :bordered="false"
      role="dialog"
      aria-modal="true"
    >
      <NSpace
        vertical
        :size="14"
      >
        <div>
          <p style="margin: 0 0 8px; font-size: 13px; color: var(--n-text-color-2);">
            {{ t('sessions.rollback.subtitle') }}
          </p>
          <code style="font-size: 12px;">{{ props.sessionId ?? '—' }}</code>
        </div>

        <NSpace
          vertical
          :size="8"
        >
          <NCheckbox
            v-model:checked="includePending"
            :disabled="previewing || applying"
          >
            {{ t('sessions.rollback.includePending') }}
          </NCheckbox>
        </NSpace>

        <NAlert
          v-if="errorMsg"
          type="error"
          :show-icon="true"
        >
          {{ errorMsg }}
        </NAlert>

        <div
          v-if="preview"
          class="preview-block"
        >
          <h4 style="margin: 0 0 8px;">
            {{ t('sessions.rollback.previewHeading') }}
          </h4>
          <NDescriptions
            :column="1"
            size="small"
            label-placement="left"
            bordered
          >
            <NDescriptionsItem
              v-for="row in formatSummaryEntries(preview.summary)"
              :key="row.label"
              :label="row.label"
            >
              <code style="font-size: 12px;">{{ row.value }}</code>
            </NDescriptionsItem>
          </NDescriptions>
          <p style="margin: 8px 0 0; font-size: 12px; color: var(--n-text-color-2);">
            {{ t('sessions.rollback.actionsCount', { n: preview.actions.length }) }}
          </p>
        </div>
      </NSpace>

      <template #footer>
        <NSpace
          justify="end"
          :size="8"
        >
          <NButton
            :disabled="previewing || applying"
            @click="close"
          >
            {{ t('sessions.rollback.cancel') }}
          </NButton>
          <NButton
            v-if="!preview"
            type="primary"
            :loading="previewing"
            @click="runPreview"
          >
            {{ t('sessions.rollback.runPreview') }}
          </NButton>
          <NButton
            v-else
            type="warning"
            :loading="applying"
            @click="applyRollback"
          >
            {{ t('sessions.rollback.apply') }}
          </NButton>
        </NSpace>
      </template>
    </NCard>
  </NModal>
</template>
