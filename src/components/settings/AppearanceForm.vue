<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { NCard, NFormItem, NRadioGroup, NRadio, NSelect, NSpace, type SelectOption } from 'naive-ui'
import { useUiStore, type ThemeMode } from '@/stores/ui'
import { useLocaleStore } from '@/stores/i18n'
import type { SupportedLocale } from '@/i18n'

const { t } = useI18n()
const ui = useUiStore()
const locale = useLocaleStore()

const theme = computed({
  get: () => ui.themeMode,
  set: (v: ThemeMode) => { ui.themeMode = v },
})

const currentLocale = computed({
  get: () => locale.current,
  set: (v: SupportedLocale) => { void locale.change(v) },
})

const localeOptions = computed<SelectOption[]>(() => [
  { label: 'English', value: 'en' },
  { label: '简体中文', value: 'zh-CN' },
  { label: '日本語', value: 'ja' },
])
</script>

<template>
  <NCard size="small">
    <NSpace
      vertical
      :size="16"
    >
      <NFormItem
        :label="t('settings.appearance.theme')"
        label-placement="left"
        :show-feedback="false"
      >
        <NRadioGroup v-model:value="theme">
          <NSpace>
            <NRadio value="light">
              {{ t('settings.appearance.themeLight') }}
            </NRadio>
            <NRadio value="dark">
              {{ t('settings.appearance.themeDark') }}
            </NRadio>
            <NRadio value="system">
              {{ t('settings.appearance.themeSystem') }}
            </NRadio>
          </NSpace>
        </NRadioGroup>
      </NFormItem>

      <NFormItem
        :label="t('settings.appearance.language')"
        label-placement="left"
        :show-feedback="false"
      >
        <NSelect
          v-model:value="currentLocale"
          :options="localeOptions"
          style="max-width: 240px;"
        />
      </NFormItem>
    </NSpace>
  </NCard>
</template>
