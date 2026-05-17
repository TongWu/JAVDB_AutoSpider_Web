<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { NSelect, NInput, NButton, NSpace, type SelectOption } from 'naive-ui'
import { useSessionsStore } from '@/stores/sessions'

const sessions = useSessionsStore()
const { t } = useI18n()

const stateOptions = computed<SelectOption[]>(() => [
  { label: t('sessions.state.in_progress'), value: 'in_progress' },
  { label: t('sessions.state.finalizing'), value: 'finalizing' },
  { label: t('sessions.state.committed'), value: 'committed' },
  { label: t('sessions.state.failed'), value: 'failed' },
])

const writeModeOptions = computed<SelectOption[]>(() => [
  { label: t('sessions.writeMode.audit'), value: 'audit' },
  { label: t('sessions.writeMode.pending'), value: 'pending' },
])

const stateValue = computed({
  get: () => sessions.filters.state,
  set: (v: string[]) => sessions.setFilter('state', v),
})
const writeModeValue = computed({
  get: () => sessions.filters.writeMode,
  set: (v: string | null) => sessions.setFilter('writeMode', v),
})
const searchValue = computed({
  get: () => sessions.filters.search,
  set: (v: string) => sessions.setFilter('search', v),
})

function reset(): void {
  sessions.resetFilters()
}
</script>

<template>
  <NSpace align="center" :wrap-item="false" :size="12" style="flex-wrap: wrap;">
    <NSelect
      v-model:value="stateValue"
      multiple
      clearable
      :options="stateOptions"
      :placeholder="t('sessions.filters.statePlaceholder')"
      style="min-width: 220px;"
      size="small"
    />
    <NSelect
      v-model:value="writeModeValue"
      clearable
      :options="writeModeOptions"
      :placeholder="t('sessions.filters.writeModePlaceholder')"
      style="min-width: 160px;"
      size="small"
    />
    <NInput
      v-model:value="searchValue"
      :placeholder="t('sessions.filters.searchPlaceholder')"
      clearable
      size="small"
      style="min-width: 220px;"
    />
    <NButton tertiary size="small" @click="reset">{{ t('sessions.filters.reset') }}</NButton>
  </NSpace>
</template>
