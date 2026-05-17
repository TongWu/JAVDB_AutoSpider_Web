<script setup lang="ts">
import { computed } from 'vue'
import { NTooltip } from 'naive-ui'

export type IndexStatus = 'committed' | 'pending' | 'failed_recent' | 'unknown'

export interface IndexStatusMeta {
  session_id?: string | null
  last_seen?: string | null
  last_error?: string | null
}

const props = defineProps<{
  status: IndexStatus
  meta?: IndexStatusMeta
}>()

// Token map matches spec §6.4. Keep in sync with the design doc.
const COLOR_MAP: Record<IndexStatus, string> = {
  committed: '#10b981',
  pending: '#f59e0b',
  failed_recent: '#dc2626',
  unknown: '#9ca3af',
}

const color = computed(() => COLOR_MAP[props.status])

const tooltip = computed(() => {
  const parts: string[] = [`Status: ${props.status}`]
  if (props.meta?.session_id) parts.push(`Session: ${props.meta.session_id}`)
  if (props.meta?.last_seen) parts.push(`Last seen: ${props.meta.last_seen}`)
  if (props.meta?.last_error) parts.push(`Error: ${props.meta.last_error}`)
  return parts.join(' · ')
})
</script>

<template>
  <NTooltip trigger="hover" placement="top">
    <template #trigger>
      <span class="d1-dot" :style="{ background: color }" :data-status="props.status" />
    </template>
    {{ tooltip }}
  </NTooltip>
</template>

<style scoped>
.d1-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
</style>
