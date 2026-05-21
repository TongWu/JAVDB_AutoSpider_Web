<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { NCard } from 'naive-ui'
import ConfigField from './ConfigField.vue'
import { useConfigStore } from '@/stores/config'
import type { ConfigMetaField } from '@/api/config'

const props = defineProps<{ section: string; fields: ConfigMetaField[] }>()

const { t, te } = useI18n()
const config = useConfigStore()

const sectionLabel = computed(() => {
  const k = `settings.config.sections.${props.section}`
  return te(k) ? t(k) : titleCase(props.section)
})

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (m) => m.toUpperCase())
}

function valueFor(key: string): unknown {
  return config.values[key]
}

function onUpdate(key: string, val: unknown): void {
  config.set(key, val)
}
</script>

<template>
  <NCard
    :title="sectionLabel"
    size="small"
    embedded
  >
    <ConfigField
      v-for="field in props.fields"
      :key="field.key"
      :meta="field"
      :model-value="valueFor(field.key)"
      @update:model-value="onUpdate(field.key, $event)"
    />
  </NCard>
</template>
