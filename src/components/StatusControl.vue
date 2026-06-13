<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { NSelect, useMessage } from 'naive-ui'
  import { useI18n } from 'vue-i18n'
  import { upsertWatchIntent, deleteWatchIntent, type WatchStatus } from '@/api/watchlist'

  const props = defineProps<{
    videoCode: string
    href: string
    initialStatus?: WatchStatus | null
  }>()

  const emit = defineEmits<{
    (e: 'change', status: WatchStatus | null): void
  }>()

  const { t } = useI18n()
  const message = useMessage()
  const status = ref<WatchStatus | null>(props.initialStatus ?? null)
  const loading = ref(false)

  watch(
    () => props.initialStatus,
    (v) => {
      status.value = v ?? null
    },
  )

  const options = computed(() => [
    { label: t('library.watchlist.status.want'), value: 'want' },
    { label: t('library.watchlist.status.viewed'), value: 'viewed' },
  ])

  async function onUpdate(value: WatchStatus | null): Promise<void> {
    loading.value = true
    try {
      if (value === null) {
        await deleteWatchIntent(props.videoCode)
      } else {
        await upsertWatchIntent(props.videoCode, { href: props.href, status: value })
      }
      status.value = value
      emit('change', value)
    } catch {
      message.error(t('library.watchlist.saveError'))
    } finally {
      loading.value = false
    }
  }
</script>

<template>
  <NSelect
    :value="status"
    :options="options"
    :loading="loading"
    size="small"
    clearable
    style="width: 116px"
    :placeholder="t('library.watchlist.untracked')"
    @update:value="onUpdate"
  />
</template>
