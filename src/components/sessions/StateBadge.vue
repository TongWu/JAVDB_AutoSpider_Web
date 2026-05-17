<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { NTag } from 'naive-ui'

const props = defineProps<{ state?: string | null }>()

const { t } = useI18n()

const normalized = computed(() => String(props.state ?? '').toLowerCase())

const tagType = computed((): 'default' | 'info' | 'success' | 'warning' | 'error' => {
  switch (normalized.value) {
    case 'in_progress':
      return 'info'
    case 'finalizing':
      return 'warning'
    case 'committed':
      return 'success'
    case 'failed':
      return 'error'
    default:
      return 'default'
  }
})

const label = computed(() => {
  if (!normalized.value) return '—'
  return t(`sessions.state.${normalized.value}`, normalized.value)
})
</script>

<template>
  <NTag :type="tagType" size="small" round>{{ label }}</NTag>
</template>
