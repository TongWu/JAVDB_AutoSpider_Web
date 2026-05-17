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
  useMessage,
} from 'naive-ui'
import { apiCommitSession, type SessionCommitResponse } from '@/api/sessions'
import { extractErrorMessage } from '@/api/errors'

const props = defineProps<{ show: boolean; sessionId: string | null }>()
const emit = defineEmits<{
  'update:show': [val: boolean]
  committed: [response: SessionCommitResponse]
}>()

const { t } = useI18n()
const message = useMessage()

const dropPending = ref(false)
const submitting = ref(false)
const errorMsg = ref<string | null>(null)

const visible = computed({
  get: () => props.show,
  set: (v: boolean) => emit('update:show', v),
})

watch(
  () => props.show,
  (open) => {
    if (open) {
      dropPending.value = false
      errorMsg.value = null
    }
  },
)

async function submit(): Promise<void> {
  if (!props.sessionId) return
  submitting.value = true
  errorMsg.value = null
  try {
    const resp = await apiCommitSession(props.sessionId, {
      force: true,
      drop_pending: dropPending.value,
    })
    message.success(t('sessions.commit.applied', { state: resp.new_state }))
    emit('committed', resp)
    visible.value = false
  } catch (err) {
    errorMsg.value = extractErrorMessage(err)
  } finally {
    submitting.value = false
  }
}

function close(): void {
  visible.value = false
}
</script>

<template>
  <NModal v-model:show="visible" :mask-closable="!submitting">
    <NCard
      style="max-width: 520px;"
      :title="t('sessions.commit.title')"
      :bordered="false"
      role="dialog"
      aria-modal="true"
    >
      <NSpace vertical :size="14">
        <div>
          <p style="margin: 0 0 8px; font-size: 13px; color: var(--n-text-color-2);">
            {{ t('sessions.commit.subtitle') }}
          </p>
          <code style="font-size: 12px;">{{ props.sessionId ?? '—' }}</code>
        </div>

        <NCheckbox v-model:checked="dropPending" :disabled="submitting">
          {{ t('sessions.commit.dropPending') }}
        </NCheckbox>

        <NAlert v-if="errorMsg" type="error" :show-icon="true">
          {{ errorMsg }}
        </NAlert>

        <NAlert type="warning" :show-icon="true">
          {{ t('sessions.commit.warning') }}
        </NAlert>
      </NSpace>

      <template #footer>
        <NSpace justify="end" :size="8">
          <NButton :disabled="submitting" @click="close">
            {{ t('sessions.commit.cancel') }}
          </NButton>
          <NButton type="primary" :loading="submitting" @click="submit">
            {{ t('sessions.commit.confirm') }}
          </NButton>
        </NSpace>
      </template>
    </NCard>
  </NModal>
</template>
