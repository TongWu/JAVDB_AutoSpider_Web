<script setup lang="ts">
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { NSpace, NButton } from 'naive-ui'
import CapabilitySnapshot from '@/components/settings/CapabilitySnapshot.vue'
import { useCapabilitiesStore } from '@/stores/capabilities'

const { t } = useI18n()
const caps = useCapabilitiesStore()

onMounted(async () => {
  await caps.fetchInitial()
})

async function refresh(): Promise<void> {
  caps.invalidate()
  await caps.refresh()
}
</script>

<template>
  <div class="settings-cap-page">
    <NSpace justify="end">
      <NButton :loading="caps.loading" @click="refresh">{{ t('settings.capabilities.refresh') }}</NButton>
    </NSpace>
    <CapabilitySnapshot />
  </div>
</template>

<style scoped>
.settings-cap-page { display: flex; flex-direction: column; gap: 12px; padding-top: 8px; }
</style>
