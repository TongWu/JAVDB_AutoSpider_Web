<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { NButton } from 'naive-ui'

const { t } = useI18n()
const router = useRouter()
</script>

<template>
  <div class="error-wrap">
    <div class="error-content">
      <div class="error-icon">
        ⚠️
      </div>
      <h1>{{ t('errors.generic.title') }}</h1>
      <p>{{ t('errors.generic.body') }}</p>
      <NButton
        type="primary"
        @click="router.push('/')"
      >
        {{ t('errors.notFound.backHome') }}
      </NButton>
    </div>
  </div>
</template>

<style scoped>
.error-wrap {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.error-content {
  max-width: 480px;
}

.error-icon {
  font-size: 72px;
  margin-bottom: 16px;
}
</style>
