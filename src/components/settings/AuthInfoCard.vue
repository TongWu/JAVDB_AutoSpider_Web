<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { NCard, NDescriptions, NDescriptionsItem, NTag, NAlert, NSpace, NButton } from 'naive-ui'
import { useAuthStore } from '@/stores/auth'

const { t } = useI18n()
const router = useRouter()
const auth = useAuthStore()

const role = computed(() => auth.role ?? '—')
const roleType = computed((): 'success' | 'info' | 'default' => {
  if (auth.role === 'admin') return 'success'
  if (auth.role === 'readonly') return 'info'
  return 'default'
})

async function signOut(): Promise<void> {
  await auth.logout()
  void router.push('/login')
}
</script>

<template>
  <NCard size="small">
    <NDescriptions :column="1" size="small" label-placement="left" bordered>
      <NDescriptionsItem :label="t('settings.auth.username')">
        {{ auth.username ?? '—' }}
      </NDescriptionsItem>
      <NDescriptionsItem :label="t('settings.auth.role')">
        <NTag :type="roleType" size="small" round>{{ role }}</NTag>
      </NDescriptionsItem>
      <NDescriptionsItem :label="t('settings.auth.tokenStatus')">
        <NTag :type="auth.isAuthenticated ? 'success' : 'default'" size="small" round>
          {{ auth.isAuthenticated ? t('settings.auth.active') : t('settings.auth.inactive') }}
        </NTag>
      </NDescriptionsItem>
    </NDescriptions>

    <NAlert type="info" :show-icon="true" style="margin-top: 16px;">
      {{ t('settings.auth.passwordNote') }}
    </NAlert>

    <NSpace style="margin-top: 16px;" justify="end">
      <NButton type="error" @click="signOut">{{ t('settings.auth.signOut') }}</NButton>
    </NSpace>
  </NCard>
</template>
