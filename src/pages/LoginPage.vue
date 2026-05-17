<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { NCard, NForm, NFormItem, NInput, NCheckbox, NButton, NH1 } from 'naive-ui'

const { t } = useI18n()
</script>

<template>
  <div class="login-wrap">
    <NCard style="width: 380px;">
      <NH1 style="margin-bottom: 24px; font-size: 22px;">
        {{ t('login.title') }}
      </NH1>
      <NForm>
        <NFormItem :label="t('login.username')">
          <NInput :placeholder="t('login.username')" />
        </NFormItem>
        <NFormItem :label="t('login.password')">
          <NInput
            type="password"
            :placeholder="t('login.password')"
          />
        </NFormItem>
        <NFormItem>
          <NCheckbox>{{ t('login.rememberMe') }}</NCheckbox>
        </NFormItem>
        <NButton
          type="primary"
          block
        >
          {{ t('login.signIn') }}
        </NButton>
      </NForm>
    </NCard>
  </div>
</template>

<style scoped>
.login-wrap {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
