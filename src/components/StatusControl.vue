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
  // Monotonic token: rapid toggles can overlap; only the newest write may
  // commit local state (and the control is also disabled while saving).
  let updateSeq = 0

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
    const seq = ++updateSeq
    loading.value = true
    try {
      if (value === null) {
        await deleteWatchIntent(props.videoCode)
      } else {
        await upsertWatchIntent(props.videoCode, { href: props.href, status: value })
      }
      if (seq !== updateSeq) return
      status.value = value
      emit('change', value)
    } catch {
      if (seq !== updateSeq) return
      message.error(t('library.watchlist.saveError'))
    } finally {
      if (seq === updateSeq) loading.value = false
    }
  }
</script>

<template>
  <NSelect
    :value="status"
    :options="options"
    :loading="loading"
    :disabled="loading"
    size="small"
    clearable
    style="width: 116px"
    :aria-label="t('library.watchlist.statusAriaLabel', { code: videoCode })"
    :title="t('library.watchlist.statusAriaLabel', { code: videoCode })"
    :placeholder="t('library.watchlist.untracked')"
    @update:value="onUpdate"
  />
</template>
