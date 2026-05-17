<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useMessage, NCard, NForm, NFormItem, NInput, NButton, NSpace, NCheckbox } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()
const { t } = useI18n()
const message = useMessage()

const username = ref('')
const password = ref('')
const rememberMe = ref(false)
const submitting = ref(false)

async function onSubmit() {
  if (!username.value || !password.value) return
  submitting.value = true
  try {
    await auth.login(username.value, password.value)
    const next = (route.query.next as string) || '/'
    void router.replace(next)
  } catch (err) {
    message.error(t('login.invalidCredentials'))
    console.error(err)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="login-wrap">
    <NCard
      :title="t('login.title')"
      style="max-width: 420px; width: 100%;"
    >
      <NForm>
        <NFormItem :label="t('login.username')">
          <NInput
            v-model:value="username"
            :placeholder="t('login.username')"
            @keyup.enter="onSubmit"
          />
        </NFormItem>
        <NFormItem :label="t('login.password')">
          <NInput
            v-model:value="password"
            type="password"
            :placeholder="t('login.password')"
            show-password-on="click"
            @keyup.enter="onSubmit"
          />
        </NFormItem>
        <NSpace vertical>
          <NCheckbox v-model:checked="rememberMe">
            {{ t('login.rememberMe') }}
          </NCheckbox>
          <NButton
            type="primary"
            block
            :loading="submitting"
            :disabled="submitting"
            @click="onSubmit"
          >
            {{ t('login.signIn') }}
          </NButton>
        </NSpace>
      </NForm>
    </NCard>
  </div>
</template>

<style scoped>
.login-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 24px;
  background: var(--n-body-color, #faf9f7);
}
</style>
