<script setup lang="ts">
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NSpace,
  NSpin,
  NAlert,
  NButton,
  useMessage,
} from 'naive-ui'
import ConfigSection from '@/components/settings/ConfigSection.vue'
import { useConfigStore } from '@/stores/config'
import { extractErrorMessage } from '@/api/errors'

const { t } = useI18n()
const config = useConfigStore()
const message = useMessage()

onMounted(async () => {
  if (config.meta.length === 0) {
    try {
      await config.fetch()
    } catch (err) {
      message.error(extractErrorMessage(err))
    }
  }
})

async function onSave(): Promise<void> {
  try {
    await config.save()
    message.success(t('settings.config.saved'))
  } catch (err) {
    message.error(extractErrorMessage(err))
  }
}

function onDiscard(): void {
  config.discard()
  message.info(t('settings.config.discarded'))
}
</script>

<template>
  <div class="settings-config-page">
    <NAlert
      v-if="config.error && config.meta.length === 0"
      type="error"
      :title="t('errors.generic.title')"
    >
      {{ extractErrorMessage(config.error) }}
    </NAlert>

    <NSpin :show="config.loading && config.meta.length === 0">
      <div class="sections-stack">
        <ConfigSection
          v-for="section in config.orderedSections"
          :key="section"
          :section="section"
          :fields="config.groupedFields[section]"
        />
      </div>
    </NSpin>

    <div
      v-if="config.isDirty"
      class="save-bar"
    >
      <span class="dirty-hint">
        {{ t('settings.config.dirtyHint', { n: config.dirtyKeys.length }) }}
      </span>
      <NSpace :size="8">
        <NButton
          :disabled="config.saving"
          @click="onDiscard"
        >
          {{ t('settings.config.discard') }}
        </NButton>
        <NButton
          type="primary"
          :loading="config.saving"
          @click="onSave"
        >
          {{ t('settings.config.save') }}
        </NButton>
      </NSpace>
    </div>
  </div>
</template>

<style scoped>
.settings-config-page { display: flex; flex-direction: column; gap: 16px; padding-top: 8px; }
.sections-stack { display: flex; flex-direction: column; gap: 12px; }
.save-bar {
  position: sticky;
  bottom: 0;
  background: var(--n-card-color);
  border-top: 1px solid var(--n-border-color);
  padding: 12px 16px;
  margin: 16px -16px -16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  z-index: 10;
}
.dirty-hint {
  font-size: 13px;
  color: var(--n-text-color-2);
}
</style>
