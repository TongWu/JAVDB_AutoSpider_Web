<script setup lang="ts">
  import { ref, watch } from 'vue'
  import { NButton, NIcon, useMessage } from 'naive-ui'
  import { upsertContentPreference } from '@/api/preferences'

  const props = defineProps<{
    contentType: 'actor' | 'category' | 'maker' | 'director'
    contentId: string
    contentName: string
    initialHearted?: boolean
  }>()

  const emit = defineEmits<{
    (e: 'change', hearted: boolean): void
  }>()

  const hearted = ref(props.initialHearted ?? false)
  const loading = ref(false)
  const message = useMessage()

  // Reconcile local state if the parent updates the heart state externally
  // (e.g. a refetch after a batch operation) without remounting this row.
  watch(
    () => props.initialHearted,
    (v) => {
      hearted.value = v ?? false
    },
  )

  async function toggle(): Promise<void> {
    loading.value = true
    try {
      await upsertContentPreference(props.contentType, props.contentId, {
        content_name: props.contentName,
        hearted: !hearted.value,
      })
      hearted.value = !hearted.value
      emit('change', hearted.value)
    } catch {
      message.error('Failed to update preference')
    } finally {
      loading.value = false
    }
  }
</script>

<template>
  <NButton
    text
    quaternary
    size="tiny"
    :focusable="false"
    :loading="loading"
    :title="hearted ? 'Remove from favourites' : 'Add to favourites'"
    :aria-label="hearted ? 'Remove from favourites' : 'Add to favourites'"
    @click.stop="toggle"
  >
    <NIcon>{{ hearted ? '❤️' : '🤍' }}</NIcon>
  </NButton>
</template>
