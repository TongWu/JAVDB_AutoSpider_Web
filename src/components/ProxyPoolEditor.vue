<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { NButton, NInput, useDialog } from 'naive-ui'

export interface ProxyEntry {
  name: string
  http: string
  https: string
}

const props = defineProps<{ modelValue: ProxyEntry[] }>()
const emit = defineEmits<{ 'update:modelValue': [val: ProxyEntry[]] }>()

const { t } = useI18n()
const dialog = useDialog()

function addEntry() {
  const next = [...(props.modelValue ?? []), { name: '', http: '', https: '' }]
  emit('update:modelValue', next)
}

function updateField(idx: number, field: keyof ProxyEntry, val: string) {
  const next = (props.modelValue ?? []).map((e, i) => (i === idx ? { ...e, [field]: val } : e))
  emit('update:modelValue', next)
}

function removeEntry(idx: number) {
  dialog.warning({
    title: t('proxyPool.confirmDeleteTitle'),
    content: t('proxyPool.confirmDeleteBody'),
    positiveText: t('common.yes'),
    negativeText: t('common.no'),
    onPositiveClick: () => {
      const next = (props.modelValue ?? []).filter((_, i) => i !== idx)
      emit('update:modelValue', next)
    },
  })
}
</script>

<template>
  <div class="proxy-pool">
    <div class="rows">
      <div
        v-for="(entry, idx) in props.modelValue"
        :key="idx"
        class="row"
      >
        <NInput
          :value="entry.name"
          :placeholder="t('proxyPool.namePlaceholder')"
          class="cell-name"
          @update:value="(v: string) => updateField(idx, 'name', v)"
        />
        <NInput
          :value="entry.http"
          :placeholder="t('proxyPool.httpPlaceholder')"
          class="cell-url"
          @update:value="(v: string) => updateField(idx, 'http', v)"
        />
        <NInput
          :value="entry.https"
          :placeholder="t('proxyPool.httpsPlaceholder')"
          class="cell-url"
          @update:value="(v: string) => updateField(idx, 'https', v)"
        />
        <NButton
          tertiary
          type="error"
          size="small"
          @click="removeEntry(idx)"
        >
          {{ t('common.delete') }}
        </NButton>
      </div>
      <div
        v-if="!props.modelValue || props.modelValue.length === 0"
        class="empty"
      >
        {{ t('proxyPool.empty') }}
      </div>
    </div>

    <NButton
      type="primary"
      tertiary
      size="small"
      @click="addEntry"
    >
      + {{ t('proxyPool.addEntry') }}
    </NButton>
  </div>
</template>

<style scoped>
.proxy-pool { display: flex; flex-direction: column; gap: 12px; }
.rows { display: flex; flex-direction: column; gap: 8px; }
.row { display: grid; grid-template-columns: 1fr 2fr 2fr auto; gap: 8px; align-items: center; }
.cell-name :deep(.n-input__input-el), .cell-url :deep(.n-input__input-el) { font-size: 12px; }
.empty { font-size: 13px; color: var(--n-text-color-disabled); padding: 16px; text-align: center; border: 1px dashed var(--n-divider-color); border-radius: 8px; }
</style>
