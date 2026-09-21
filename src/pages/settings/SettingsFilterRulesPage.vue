<script setup lang="ts">
import { computed, h, ref, watch } from 'vue'
import axios from 'axios'
import {
  NAlert, NButton, NCard, NDataTable, NInput, NInputNumber, NSelect, NSpace, NSpin, NSwitch, NTag,
  useMessage, type DataTableColumns,
} from 'naive-ui'
import { useI18n } from 'vue-i18n'
import { useCapabilitiesStore } from '@/stores/capabilities'
import { useAuthStore } from '@/stores/auth'
import {
  listContentFilterRules, addContentFilterRule, setContentFilterRuleEnabled,
  deleteContentFilterRule, compareContentFilterImpact, type ContentFilterRule,
  type ContentFilterImpactItem, type ContentFilterImpactResponse,
} from '@/api/content-filter'

const { t } = useI18n()
const message = useMessage()
const cap = useCapabilitiesStore()
const auth = useAuthStore()

const enabledFeature = computed(() => cap.data?.features?.content_filter === true)
const isAdmin = computed(() => auth.role === 'admin')

const rules = ref<ContentFilterRule[]>([])
const baselineVersion = ref('')
const loading = ref(false)
const error = ref<string | null>(null)

// Add-form state. The allow-list mirrors the canonical CLI tuples (13 valid
// (dimension, mode) pairs). The backend validates the chosen pair and returns a
// 422 for an illegal combination, which surfaces as a save error toast.
const draftDimension = ref<string>('tag')
const draftMode = ref<string>('exclude')
const draftValue = ref<string>('')
const saving = ref(false)
const comparing = ref(false)
const impact = ref<ContentFilterImpactResponse | null>(null)
const impactError = ref<string | null>(null)
const cohortSize = ref(500)

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
const validRuleModes = new Set([
  'actor:exclude', 'tag:exclude', 'tag:include',
  'gender:require_lead', 'gender:exclude_all_male',
  'age:min_age', 'age:max_age',
  'actor:regex_exclude', 'actor:regex_include',
  'tag:regex_exclude', 'tag:regex_include',
  'release_date:before', 'release_date:after',
])
const valueRequired = new Set([...validRuleModes].filter((key) => key !== 'gender:exclude_all_male'))
const regexMetacharacters = /[\\.^$*+?{}[\]()]/

function isStrictIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

const isDraftValid = computed(() => {
  const key = `${draftDimension.value}:${draftMode.value}`
  const value = draftValue.value.trim()
  if (!validRuleModes.has(key)) return false
  if (!valueRequired.has(key)) return value === ''
  if (value === '') return false
  if (key === 'gender:require_lead') return ['female', 'male'].includes(value.toLowerCase())
  if (draftDimension.value === 'age') return /^\d+$/.test(value)
  if (draftDimension.value === 'release_date') return isStrictIsoDate(value)
  if (draftMode.value.startsWith('regex_')) {
    return value.length <= 200
      && value.split('|').every((branch) => branch.length > 0)
      && !regexMetacharacters.test(value)
      && ![...value].some((char) => {
        const code = char.codePointAt(0) ?? 0
        return code < 32 || code === 127
      })
  }
  return true
})

async function fetchRules(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    const res = await listContentFilterRules()
    rules.value = res.items
    baselineVersion.value = res.baseline_version
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('settings.filterRules.loadError')
  } finally {
    loading.value = false
  }
}

function invalidateImpact(): void {
  impact.value = null
  impactError.value = null
}

function draftRules() {
  return [
    ...rules.value.map((rule) => ({ ...rule })),
    {
      id: -1,
      dimension: draftDimension.value,
      mode: draftMode.value,
      value: draftValue.value.trim(),
      enabled: true,
    },
  ]
}

async function runComparison(page = 1): Promise<void> {
  if (!isDraftValid.value) return
  comparing.value = true
  impactError.value = null
  try {
    impact.value = await compareContentFilterImpact({
      baseline_version: baselineVersion.value,
      draft_rules: draftRules(),
      cohort_size: cohortSize.value,
      page,
      page_size: 100,
      expected_cohort_version: page > 1 ? impact.value?.cohort_version : undefined,
    })
  } catch (err: unknown) {
    const status = axios.isAxiosError(err) ? err.response?.status : undefined
    impact.value = null
    impactError.value = status === 409
      ? t('settings.filterRules.impact.concurrentChange')
      : t('settings.filterRules.impact.error')
  } finally {
    comparing.value = false
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
    invalidateImpact()
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
    invalidateImpact()
    await fetchRules()
  } catch {
    message.error(t('settings.filterRules.saveError'))
  }
}

async function onDelete(row: ContentFilterRule): Promise<void> {
  try {
    await deleteContentFilterRule(row.id)
    invalidateImpact()
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

const impactColumns = computed<DataTableColumns<ContentFilterImpactItem>>(() => [
  { title: t('settings.filterRules.impact.col.movie'), key: 'video_code', width: 130 },
  { title: t('settings.filterRules.impact.col.title'), key: 'title' },
  {
    title: t('settings.filterRules.impact.col.current'),
    key: 'current',
    width: 140,
    render: (row) => h(NTag, { type: row.current.outcome === 'drop' ? 'error' : row.current.outcome === 'unknown' ? 'warning' : 'success' }, { default: () => row.current.outcome }),
  },
  {
    title: t('settings.filterRules.impact.col.draft'),
    key: 'draft',
    width: 140,
    render: (row) => h(NTag, { type: row.draft.outcome === 'drop' ? 'error' : row.draft.outcome === 'unknown' ? 'warning' : 'success' }, { default: () => row.draft.outcome }),
  },
  { title: t('settings.filterRules.impact.col.transition'), key: 'transition', width: 150 },
  {
    title: t('settings.filterRules.impact.col.reasons'),
    key: 'reasons',
    render: (row) => [...row.current.reasons, ...row.draft.reasons].join('; ') || '—',
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
        <NSpace align="center">
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
            v-if="isAdmin"
            type="primary"
            :loading="saving"
            @click="onAdd"
          >
            {{ t('settings.filterRules.add') }}
          </NButton>
          <NInputNumber
            v-model:value="cohortSize"
            :min="1"
            :max="5000"
            style="width: 130px"
          />
          <NButton
            secondary
            :loading="comparing"
            :disabled="!isDraftValid"
            @click="runComparison(1)"
          >
            {{ t('settings.filterRules.impact.compare') }}
          </NButton>
        </NSpace>
        <NAlert
          v-if="!isAdmin"
          type="warning"
          :show-icon="true"
        >
          {{ t('settings.filterRules.adminOnly') }}
        </NAlert>
      </NCard>

      <NAlert
        type="info"
        :show-icon="true"
      >
        {{ t('settings.filterRules.impact.readOnly') }}
      </NAlert>

      <NAlert
        v-if="impactError"
        type="error"
        :show-icon="true"
        closable
        @close="impactError = null"
      >
        {{ impactError }}
      </NAlert>

      <NCard
        v-if="impact"
        :title="t('settings.filterRules.impact.title')"
        size="small"
      >
        <NSpace vertical>
          <div>
            {{ t('settings.filterRules.impact.summary', {
              total: impact.total,
              keep: impact.summary.draft.keep ?? 0,
              drop: impact.summary.draft.drop ?? 0,
              unknown: impact.summary.draft.unknown ?? 0,
              covered: impact.coverage.both_known,
            }) }}
          </div>
          <div class="impact-version">
            {{ t('settings.filterRules.impact.baseline') }}: <code>{{ impact.baseline_version }}</code>
          </div>
          <NDataTable
            :columns="impactColumns"
            :data="impact.items"
            :row-key="(row: ContentFilterImpactItem) => row.href"
            size="small"
          />
          <NSpace justify="end">
            <NButton
              :disabled="impact.page <= 1 || comparing"
              @click="runComparison(impact.page - 1)"
            >
              {{ t('common.previous') }}
            </NButton>
            <NButton
              :disabled="!impact.has_more || comparing"
              @click="runComparison(impact.page + 1)"
            >
              {{ t('common.next') }}
            </NButton>
          </NSpace>
        </NSpace>
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
.impact-version { color: var(--n-text-color-3); font-size: 12px; overflow-wrap: anywhere; }
</style>
