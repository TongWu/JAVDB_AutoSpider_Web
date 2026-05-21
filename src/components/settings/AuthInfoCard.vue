<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { NCard, NDescriptions, NDescriptionsItem, NTag, NSpace, NButton } from 'naive-ui'
import { useAuthStore } from '@/stores/auth'
import ChangePasswordDialog from './ChangePasswordDialog.vue'

const { t } = useI18n()
const router = useRouter()
const auth = useAuthStore()

const role = computed(() => auth.role ?? '—')
const roleType = computed((): 'success' | 'info' | 'default' => {
  if (auth.role === 'admin') return 'success'
  if (auth.role === 'readonly') return 'info'
  return 'default'
})

const showChangePassword = ref(false)

async function signOut(): Promise<void> {
  await auth.logout()
  void router.push('/login')
}
</script>

<template>
  <NCard size="small">
    <NDescriptions
      :column="1"
      size="small"
      label-placement="left"
      bordered
    >
      <NDescriptionsItem :label="t('settings.auth.username')">
        {{ auth.username ?? '—' }}
      </NDescriptionsItem>
      <NDescriptionsItem :label="t('settings.auth.role')">
        <NTag
          :type="roleType"
          size="small"
          round
        >
          {{ role }}
        </NTag>
      </NDescriptionsItem>
      <NDescriptionsItem :label="t('settings.auth.tokenStatus')">
        <NTag
          :type="auth.isAuthenticated ? 'success' : 'default'"
          size="small"
          round
        >
          {{ auth.isAuthenticated ? t('settings.auth.active') : t('settings.auth.inactive') }}
        </NTag>
      </NDescriptionsItem>
    </NDescriptions>

    <NSpace
      style="margin-top: 16px;"
      justify="space-between"
    >
      <NButton @click="showChangePassword = true">
        {{ t('settings.auth.changePassword.open') }}
      </NButton>
      <NButton
        type="error"
        @click="signOut"
      >
        {{ t('settings.auth.signOut') }}
      </NButton>
    </NSpace>

    <ChangePasswordDialog v-model:show="showChangePassword" />
  </NCard>
</template>
