<script setup lang="ts">
import { computed, h, ref, watch } from 'vue'
import {
  NAlert, NButton, NCard, NDataTable, NInput, NSelect, NSpace, NSpin, NSwitch,
  useMessage, type DataTableColumns,
} from 'naive-ui'
import { useI18n } from 'vue-i18n'
import { useCapabilitiesStore } from '@/stores/capabilities'
import { useAuthStore } from '@/stores/auth'
import {
  listContentFilterRules, addContentFilterRule, setContentFilterRuleEnabled,
  deleteContentFilterRule, type ContentFilterRule,
} from '@/api/content-filter'

const { t } = useI18n()
const message = useMessage()
const cap = useCapabilitiesStore()
const auth = useAuthStore()

const enabledFeature = computed(() => cap.data?.features?.content_filter === true)
const isAdmin = computed(() => auth.role === 'admin')

const rules = ref<ContentFilterRule[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

// Add-form state. The allow-list mirrors the canonical CLI tuples (13 valid
// (dimension, mode) pairs). The backend validates the chosen pair and returns a
// 422 for an illegal combination, which surfaces as a save error toast.
const draftDimension = ref<string>('tag')
const draftMode = ref<string>('exclude')
const draftValue = ref<string>('')
const saving = ref(false)

const dimensionOptions = [
  { label: 'actor', value: 'actor' },
  { label: 'tag', value: 'tag' },
  { label: 'gender', value: 'gender' },
  { label: 'age', value: 'age' },
  { label: 'release_date', value: 'release_date' },
]
const modeOptions = [
  { label: 'exclude', value: 'exclude' },
  { label: 'include', value: 'include' },
  { label: 'require_lead', value: 'require_lead' },
  { label: 'exclude_all_male', value: 'exclude_all_male' },
  { label: 'min_age', value: 'min_age' },
  { label: 'max_age', value: 'max_age' },
  { label: 'regex_exclude', value: 'regex_exclude' },
  { label: 'regex_include', value: 'regex_include' },
  { label: 'before', value: 'before' },
  { label: 'after', value: 'after' },
]

async function fetchRules(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    const res = await listContentFilterRules()
    rules.value = res.items
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('settings.filterRules.loadError')
  } finally {
    loading.value = false
  }
}

async function onAdd(): Promise<void> {
  saving.value = true
  try {
    await addContentFilterRule({
      dimension: draftDimension.value,
      mode: draftMode.value,
      value: draftValue.value.trim(),
    })
    draftValue.value = ''
    await fetchRules()
    message.success(t('settings.filterRules.added'))
  } catch {
    message.error(t('settings.filterRules.saveError'))
  } finally {
    saving.value = false
  }
}

async function onToggle(row: ContentFilterRule, enabled: boolean): Promise<void> {
  try {
    await setContentFilterRuleEnabled(row.id, enabled)
    await fetchRules()
  } catch {
    message.error(t('settings.filterRules.saveError'))
  }
}

async function onDelete(row: ContentFilterRule): Promise<void> {
  try {
    await deleteContentFilterRule(row.id)
    await fetchRules()
  } catch {
    message.error(t('settings.filterRules.saveError'))
  }
}

const columns = computed<DataTableColumns<ContentFilterRule>>(() => [
  { title: t('settings.filterRules.col.id'), key: 'id', width: 64 },
  { title: t('settings.filterRules.col.dimension'), key: 'dimension', width: 100 },
  { title: t('settings.filterRules.col.mode'), key: 'mode', width: 140 },
  { title: t('settings.filterRules.col.value'), key: 'value' },
  {
    title: t('settings.filterRules.col.enabled'),
    key: 'enabled',
    width: 90,
    render: (row) =>
      h(NSwitch, {
        value: row.enabled,
        disabled: !isAdmin.value,
        'onUpdate:value': (v: boolean) => void onToggle(row, v),
      }),
  },
  {
    title: t('settings.filterRules.col.actions'),
    key: 'actions',
    width: 100,
    render: (row) =>
      h(
        NButton,
        { size: 'small', type: 'error', tertiary: true, disabled: !isAdmin.value, onClick: () => void onDelete(row) },
        { default: () => t('common.delete') },
      ),
  },
])

// Load when the capability resolves — `cap.data` is filled asynchronously, so a
// one-shot check can miss it and leave the page blank until a manual refresh.
watch(
  enabledFeature,
  (enabled) => {
    if (enabled) void fetchRules()
  },
  { immediate: true },
)
</script>

<template>
  <div class="filter-rules-page">
    <NAlert
      v-if="!enabledFeature"
      type="info"
      :show-icon="true"
    >
      {{ t('settings.filterRules.disabled') }}
    </NAlert>

    <template v-else>
      <NCard
        :title="t('settings.filterRules.addTitle')"
        size="small"
      >
        <NSpace
          v-if="isAdmin"
          align="center"
        >
          <NSelect
            v-model:value="draftDimension"
            :options="dimensionOptions"
            style="width: 130px"
          />
          <NSelect
            v-model:value="draftMode"
            :options="modeOptions"
            style="width: 170px"
          />
          <NInput
            v-model:value="draftValue"
            :placeholder="t('settings.filterRules.valuePlaceholder')"
            style="width: 260px"
          />
          <NButton
            type="primary"
            :loading="saving"
            @click="onAdd"
          >
            {{ t('settings.filterRules.add') }}
          </NButton>
        </NSpace>
        <NAlert
          v-else
          type="warning"
          :show-icon="true"
        >
          {{ t('settings.filterRules.adminOnly') }}
        </NAlert>
      </NCard>

      <NAlert
        v-if="error"
        type="error"
        :show-icon="true"
        closable
        @close="error = null"
      >
        {{ error }}
      </NAlert>

      <NSpin :show="loading">
        <NDataTable
          :columns="columns"
          :data="rules"
          :row-key="(row: ContentFilterRule) => row.id"
          size="small"
        />
      </NSpin>
    </template>
  </div>
</template>

<style scoped>
.filter-rules-page { display: flex; flex-direction: column; gap: 12px; }
</style>
