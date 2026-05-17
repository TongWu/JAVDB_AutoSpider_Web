<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { NButton } from 'naive-ui'

const { t } = useI18n()
const router = useRouter()
</script>

<template>
  <div class="error-content">
    <div class="error-code">
      403
    </div>
    <h1>{{ t('errors.forbidden.title') }}</h1>
    <p>{{ t('errors.forbidden.body') }}</p>
    <NButton @click="router.push('/')">
      {{ t('errors.notFound.backHome') }}
    </NButton>
  </div>
</template>

<style scoped>
.error-content {
  padding: 48px;
  text-align: center;
}

.error-code {
  font-size: 96px;
  font-weight: 700;
  line-height: 1;
  color: #dc2626;
  margin-bottom: 16px;
}
</style>
