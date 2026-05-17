<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { NSwitch, NInput, NInputNumber, NTag, NTooltip, NIcon } from 'naive-ui'
import type { ConfigMetaField } from '@/api/config'

const props = defineProps<{
  meta: ConfigMetaField
  modelValue: unknown
}>()
const emit = defineEmits<{ 'update:modelValue': [val: unknown] }>()

const { t, te } = useI18n()

const labelText = computed(() => {
  const k = `settings.config.fields.${props.meta.key}.label`
  return te(k) ? t(k) : props.meta.key
})

const descriptionText = computed(() => {
  const k = `settings.config.fields.${props.meta.key}.description`
  return te(k) ? t(k) : ''
})

function setValue(v: unknown): void {
  emit('update:modelValue', v)
}

// Local string buffers for typed inputs that need parsing.
const jsonBuffer = ref<string>(
  props.meta.type === 'json' && props.modelValue !== undefined
    ? jsonStringify(props.modelValue)
    : '',
)
const jsonError = ref<string | null>(null)

function onJsonBlur(): void {
  jsonError.value = null
  try {
    if (jsonBuffer.value.trim() === '') {
      setValue(props.meta.type === 'json' ? (Array.isArray(props.modelValue) ? [] : {}) : null)
      return
    }
    const parsed = JSON.parse(jsonBuffer.value)
    setValue(parsed)
  } catch (err) {
    jsonError.value = err instanceof Error ? err.message : String(err)
  }
}

function jsonStringify(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2)
  } catch {
    return ''
  }
}

const boolValue = computed({
  get: () => !!props.modelValue,
  set: (v: boolean) => setValue(v),
})

const stringValue = computed({
  get: () => (props.modelValue == null ? '' : String(props.modelValue)),
  set: (v: string) => setValue(v),
})

const numberValue = computed({
  get: () => (typeof props.modelValue === 'number' ? props.modelValue : null),
  set: (v: number | null) => setValue(v),
})
</script>

<template>
  <div class="config-field">
    <div class="label-row">
      <label class="label">{{ labelText }}</label>
      <NTag v-if="props.meta.sensitive" size="tiny" type="warning" round>secret</NTag>
      <NTag v-if="props.meta.readonly" size="tiny" type="default" round>read-only</NTag>
      <NTooltip v-if="descriptionText" placement="right">
        <template #trigger>
          <NIcon size="14" style="cursor: help; color: var(--n-text-color-3);">
            ⓘ
          </NIcon>
        </template>
        {{ descriptionText }}
      </NTooltip>
    </div>

    <div class="control-row">
      <NSwitch v-if="props.meta.type === 'bool'" v-model:value="boolValue" :disabled="props.meta.readonly" />

      <NInputNumber
        v-else-if="props.meta.type === 'int'"
        v-model:value="numberValue"
        :disabled="props.meta.readonly"
        :precision="0"
        clearable
        style="max-width: 240px;"
      />

      <NInputNumber
        v-else-if="props.meta.type === 'float'"
        v-model:value="numberValue"
        :disabled="props.meta.readonly"
        :precision="2"
        :step="0.05"
        clearable
        style="max-width: 240px;"
      />

      <div v-else-if="props.meta.type === 'json'" style="width: 100%;">
        <NInput
          v-model:value="jsonBuffer"
          type="textarea"
          :rows="3"
          :placeholder="'{}'"
          :disabled="props.meta.readonly"
          @blur="onJsonBlur"
        />
        <p v-if="jsonError" class="json-error">{{ jsonError }}</p>
      </div>

      <NInput
        v-else-if="props.meta.sensitive"
        v-model:value="stringValue"
        type="password"
        show-password-on="click"
        :placeholder="String(props.modelValue ?? '')"
        :disabled="props.meta.readonly"
        style="max-width: 480px;"
      />

      <NInput
        v-else
        v-model:value="stringValue"
        :disabled="props.meta.readonly"
        style="max-width: 480px;"
      />
    </div>
  </div>
</template>

<style scoped>
.config-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 0;
  border-bottom: 1px solid var(--n-border-color);
}
.config-field:last-child { border-bottom: none; }
.label-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
.label {
  font-weight: 500;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.control-row {
  display: flex;
  align-items: center;
}
.json-error {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--n-color-error, #f87171);
}
</style>
