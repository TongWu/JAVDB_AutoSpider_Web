<script setup lang="ts">
import { NCard, NSpace, NButton } from 'naive-ui'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  hintId: string
  title: string
  body: string
  actionLabel?: string
  actionRoute?: string
}>()

const emit = defineEmits<{
  dismiss: [hintId: string]
  action: [hintId: string]
}>()

const { t } = useI18n()
</script>

<template>
  <NCard size="small" class="hint-card">
    <div class="content">
      <h4 class="title">{{ props.title }}</h4>
      <p class="body">{{ props.body }}</p>
    </div>
    <NSpace>
      <NButton
        v-if="props.actionLabel"
        size="small"
        type="primary"
        @click="emit('action', props.hintId)"
      >
        {{ props.actionLabel }}
      </NButton>
      <NButton size="small" tertiary @click="emit('dismiss', props.hintId)">
        {{ t('common.dismiss') }}
      </NButton>
    </NSpace>
  </NCard>
</template>

<style scoped>
.hint-card {
  border-left: 3px solid var(--n-color-info);
  margin-bottom: 12px;
}
.content {
  margin-bottom: 12px;
}
.title {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 4px;
}
.body {
  color: var(--n-text-color-2);
  font-size: 13px;
  margin: 0;
  line-height: 1.5;
}
</style>
