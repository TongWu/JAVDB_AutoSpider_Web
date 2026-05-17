<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NModal,
  NCard,
  NForm,
  NFormItem,
  NInput,
  NSpace,
  NButton,
  NAlert,
  useMessage,
} from 'naive-ui'
import { apiChangePassword } from '@/api/auth'
import { extractErrorMessage } from '@/api/errors'

const props = defineProps<{ show: boolean }>()
const emit = defineEmits<{
  'update:show': [val: boolean]
  changed: []
}>()

const { t } = useI18n()
const message = useMessage()

const MIN_NEW_LENGTH = 8

const form = reactive({
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
})
const submitting = ref(false)
const serverError = ref<string | null>(null)

watch(
  () => props.show,
  (val) => {
    if (val) {
      form.currentPassword = ''
      form.newPassword = ''
      form.confirmPassword = ''
      serverError.value = null
    }
  },
)

const newTooShort = computed(
  () => form.newPassword.length > 0 && form.newPassword.length < MIN_NEW_LENGTH,
)
const confirmMismatch = computed(
  () =>
    form.confirmPassword.length > 0 &&
    form.newPassword !== form.confirmPassword,
)
const canSubmit = computed(
  () =>
    !submitting.value &&
    form.currentPassword.length > 0 &&
    form.newPassword.length >= MIN_NEW_LENGTH &&
    form.newPassword === form.confirmPassword,
)

async function onSubmit(): Promise<void> {
  if (!canSubmit.value) return
  submitting.value = true
  serverError.value = null
  try {
    await apiChangePassword(form.currentPassword, form.newPassword)
    message.success(t('settings.auth.changePassword.success'))
    emit('changed')
    emit('update:show', false)
  } catch (err) {
    serverError.value = extractErrorMessage(err)
  } finally {
    submitting.value = false
  }
}

function onCancel(): void {
  emit('update:show', false)
}
</script>

<template>
  <NModal :show="props.show" :mask-closable="false" @update:show="emit('update:show', $event)">
    <NCard
      style="max-width: 480px;"
      :title="t('settings.auth.changePassword.title')"
      size="small"
      :bordered="false"
      role="dialog"
      aria-modal="true"
    >
      <NAlert
        v-if="serverError"
        type="error"
        :show-icon="true"
        style="margin-bottom: 12px;"
      >
        {{ serverError }}
      </NAlert>

      <NForm label-placement="top" size="medium" :show-feedback="true">
        <NFormItem :label="t('settings.auth.changePassword.current')">
          <NInput
            v-model:value="form.currentPassword"
            type="password"
            show-password-on="click"
            :placeholder="t('settings.auth.changePassword.currentPlaceholder')"
            :input-props="{ autocomplete: 'current-password' }"
          />
        </NFormItem>
        <NFormItem
          :label="t('settings.auth.changePassword.new')"
          :feedback="newTooShort ? t('settings.auth.changePassword.tooShort', { n: MIN_NEW_LENGTH }) : ''"
          :validation-status="newTooShort ? 'error' : undefined"
        >
          <NInput
            v-model:value="form.newPassword"
            type="password"
            show-password-on="click"
            :placeholder="t('settings.auth.changePassword.newPlaceholder', { n: MIN_NEW_LENGTH })"
            :input-props="{ autocomplete: 'new-password' }"
          />
        </NFormItem>
        <NFormItem
          :label="t('settings.auth.changePassword.confirm')"
          :feedback="confirmMismatch ? t('settings.auth.changePassword.mismatch') : ''"
          :validation-status="confirmMismatch ? 'error' : undefined"
        >
          <NInput
            v-model:value="form.confirmPassword"
            type="password"
            show-password-on="click"
            :placeholder="t('settings.auth.changePassword.confirmPlaceholder')"
            :input-props="{ autocomplete: 'new-password' }"
          />
        </NFormItem>
      </NForm>

      <template #footer>
        <NSpace justify="end">
          <NButton :disabled="submitting" @click="onCancel">
            {{ t('settings.auth.changePassword.cancel') }}
          </NButton>
          <NButton type="primary" :loading="submitting" :disabled="!canSubmit" @click="onSubmit">
            {{ t('settings.auth.changePassword.submit') }}
          </NButton>
        </NSpace>
      </template>
    </NCard>
  </NModal>
</template>
