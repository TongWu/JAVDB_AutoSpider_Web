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
      <div class="error-code">
        404
      </div>
      <h1>{{ t('errors.notFound.title') }}</h1>
      <p>{{ t('errors.notFound.body') }}</p>
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

.error-code {
  font-size: 96px;
  font-weight: 700;
  line-height: 1;
  color: #7c3aed;
  margin-bottom: 16px;
}
</style>
