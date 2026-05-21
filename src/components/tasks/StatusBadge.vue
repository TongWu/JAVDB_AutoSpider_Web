<script setup lang="ts">
import { computed } from 'vue'
import { NTag } from 'naive-ui'

const props = defineProps<{ status?: string | null }>()

const variant = computed(() => {
  const s = String(props.status ?? '').toLowerCase()
  if (s === 'running' || s === 'pending') return { type: 'info' as const, label: s }
  if (s === 'success' || s === 'completed' || s === 'ok' || s === 'done') return { type: 'success' as const, label: s }
  if (s === 'failed' || s === 'error') return { type: 'error' as const, label: s }
  if (s === 'cancelled' || s === 'canceled') return { type: 'warning' as const, label: s }
  return { type: 'default' as const, label: s || 'unknown' }
})
</script>

<template>
  <NTag
    :type="variant.type"
    size="small"
    round
  >
    {{ variant.label }}
  </NTag>
</template>
