<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { NCard, NDescriptions, NDescriptionsItem, NTag, NSpin } from 'naive-ui'
import { useCapabilitiesStore } from '@/stores/capabilities'

const { t } = useI18n()
const caps = useCapabilitiesStore()

const data = computed(() => caps.data)

function formatValue(value: unknown): { kind: 'tag' | 'text' | 'object'; text: string; tagType?: 'success' | 'default' | 'info' | 'warning' } {
  if (typeof value === 'boolean') {
    return { kind: 'tag', text: value ? 'true' : 'false', tagType: value ? 'success' : 'default' }
  }
  if (value == null) return { kind: 'text', text: '—' }
  if (typeof value === 'object') {
    return { kind: 'object', text: JSON.stringify(value, null, 2) }
  }
  return { kind: 'text', text: String(value) }
}
</script>

<template>
  <NCard size="small">
    <NSpin :show="caps.loading && !data">
      <NDescriptions v-if="data" :column="1" size="small" label-placement="left" bordered>
        <template v-for="(value, key) in data" :key="key">
          <NDescriptionsItem :label="String(key)">
            <template v-if="formatValue(value).kind === 'tag'">
              <NTag :type="formatValue(value).tagType" size="small" round>
                {{ formatValue(value).text }}
              </NTag>
            </template>
            <template v-else-if="formatValue(value).kind === 'object'">
              <pre class="object-block">{{ formatValue(value).text }}</pre>
            </template>
            <template v-else>
              {{ formatValue(value).text }}
            </template>
          </NDescriptionsItem>
        </template>
      </NDescriptions>
      <div v-else style="min-height: 120px;" />
    </NSpin>
  </NCard>
</template>

<style scoped>
.object-block {
  margin: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  white-space: pre-wrap;
}
</style>
