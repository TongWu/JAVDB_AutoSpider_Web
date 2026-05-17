<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NSpace, NButton, NSwitch, NInputNumber, NInput, NCollapse, NCollapseItem,
  NCheckbox, NDivider,
} from 'naive-ui'
import { useCapabilitiesStore } from '@/stores/capabilities'

export type RunMode = 'daily' | 'adhoc'
export type RunWhere = 'local' | 'github'

export interface RunFormSubmitPayload {
  where: RunWhere
  useAdvanced: boolean
  // Standard
  dryRun: boolean
  useProxy: boolean | null
  startPage?: number
  endPage?: number
  url?: string
  ignoreReleaseDate?: boolean
  // Advanced (SpiderJobPayload subset)
  phase?: 1 | 2
  ignoreHistory?: boolean
  maxMoviesPhase1?: number | null
  maxMoviesPhase2?: number | null
  enableDedup?: boolean
  redownloadThreshold?: number | null
  noRcloneFilter?: boolean
  disableAllFilters?: boolean
}

const props = defineProps<{ mode: RunMode }>()
const emit = defineEmits<{ submit: [payload: RunFormSubmitPayload] }>()

const { t } = useI18n()
const cap = useCapabilitiesStore()

const where = ref<RunWhere>('local')
const dryRun = ref(false)
const useProxyTri = ref<'auto' | 'on' | 'off'>('auto')   // tri-state to map to null/true/false
const startPage = ref(1)
const endPage = ref(10)
const url = ref('')
const ignoreReleaseDate = ref(false)

const useAdvanced = ref(false)
const phase = ref<1 | 2>(1)
const ignoreHistory = ref(false)
const maxMoviesPhase1 = ref<number | null>(null)
const maxMoviesPhase2 = ref<number | null>(null)
const enableDedup = ref(true)
const redownloadThreshold = ref<number | null>(0.30)
const noRcloneFilter = ref(false)
const disableAllFilters = ref(false)

const submitting = ref(false)

const showWhereToggle = computed(() => cap.data?.ingestion_mode === 'dual')

function proxyValue(): boolean | null {
  if (useProxyTri.value === 'on') return true
  if (useProxyTri.value === 'off') return false
  return null
}

function onSubmit() {
  if (props.mode === 'adhoc' && !url.value.trim()) return
  submitting.value = true
  emit('submit', {
    where: where.value,
    useAdvanced: useAdvanced.value,
    dryRun: dryRun.value,
    useProxy: proxyValue(),
    startPage: props.mode === 'daily' ? startPage.value : undefined,
    endPage: props.mode === 'daily' ? endPage.value : undefined,
    url: props.mode === 'adhoc' ? url.value.trim() : undefined,
    ignoreReleaseDate: props.mode === 'adhoc' ? ignoreReleaseDate.value : undefined,
    phase: useAdvanced.value ? phase.value : undefined,
    ignoreHistory: useAdvanced.value ? ignoreHistory.value : undefined,
    maxMoviesPhase1: useAdvanced.value ? maxMoviesPhase1.value : undefined,
    maxMoviesPhase2: useAdvanced.value ? maxMoviesPhase2.value : undefined,
    enableDedup: useAdvanced.value ? enableDedup.value : undefined,
    redownloadThreshold: useAdvanced.value ? redownloadThreshold.value : undefined,
    noRcloneFilter: useAdvanced.value ? noRcloneFilter.value : undefined,
    disableAllFilters: useAdvanced.value ? disableAllFilters.value : undefined,
  })
}

// Expose a method to clear submitting state from parent
defineExpose({ reset() { submitting.value = false } })
</script>

<template>
  <div class="run-form">
    <div v-if="showWhereToggle" class="row">
      <label class="label">{{ t('run.runOnLabel') }}</label>
      <NSpace>
        <NButton :type="where === 'local' ? 'primary' : 'default'" size="small" @click="where = 'local'">
          {{ t('run.runLocal') }}
        </NButton>
        <NButton :type="where === 'github' ? 'primary' : 'default'" size="small" @click="where = 'github'">
          {{ t('run.runGithub') }}
        </NButton>
      </NSpace>
    </div>

    <div v-if="props.mode === 'adhoc'" class="row">
      <label class="label">{{ t('run.adhoc.urlLabel') }}</label>
      <NInput v-model:value="url" :placeholder="t('run.adhoc.urlPlaceholder')" />
    </div>

    <div v-if="props.mode === 'daily'" class="row2">
      <div>
        <label class="label">{{ t('run.daily.startPage') }}</label>
        <NInputNumber v-model:value="startPage" :min="1" :max="200" />
      </div>
      <div>
        <label class="label">{{ t('run.daily.endPage') }}</label>
        <NInputNumber v-model:value="endPage" :min="1" :max="200" />
      </div>
    </div>

    <div class="row inline">
      <NSpace align="center" size="large">
        <NSpace align="center" size="small">
          <NSwitch v-model:value="dryRun" />
          <span class="inline-label">{{ t('run.dryRun') }}</span>
        </NSpace>
        <NSpace align="center" size="small">
          <span class="inline-label">{{ t('run.useProxy') }}:</span>
          <NButton size="tiny" :type="useProxyTri === 'auto' ? 'primary' : 'default'" @click="useProxyTri = 'auto'">auto</NButton>
          <NButton size="tiny" :type="useProxyTri === 'on' ? 'primary' : 'default'" @click="useProxyTri = 'on'">on</NButton>
          <NButton size="tiny" :type="useProxyTri === 'off' ? 'primary' : 'default'" @click="useProxyTri = 'off'">off</NButton>
        </NSpace>
        <NSpace v-if="props.mode === 'adhoc'" align="center" size="small">
          <NSwitch v-model:value="ignoreReleaseDate" />
          <span class="inline-label">{{ t('run.adhoc.ignoreReleaseDate') }}</span>
        </NSpace>
      </NSpace>
    </div>

    <NCollapse>
      <NCollapseItem :title="t('run.advancedTitle')" name="advanced">
        <div class="advanced">
          <div class="row inline">
            <NCheckbox v-model:checked="useAdvanced">{{ t('run.advancedActivate') }}</NCheckbox>
            <span class="hint" style="margin-left: 12px;">{{ t('run.advancedHint') }}</span>
          </div>

          <NDivider style="margin: 8px 0" />

          <div class="row2">
            <div>
              <label class="label">{{ t('run.advanced.phase') }}</label>
              <NInputNumber v-model:value="phase" :min="1" :max="2" />
            </div>
            <NSpace align="center" size="small">
              <NSwitch v-model:value="ignoreHistory" />
              <span class="inline-label">{{ t('run.advanced.ignoreHistory') }}</span>
            </NSpace>
          </div>

          <div class="row2">
            <div>
              <label class="label">{{ t('run.advanced.maxMoviesPhase1') }}</label>
              <NInputNumber v-model:value="maxMoviesPhase1" :min="0" :max="9999" clearable />
            </div>
            <div>
              <label class="label">{{ t('run.advanced.maxMoviesPhase2') }}</label>
              <NInputNumber v-model:value="maxMoviesPhase2" :min="0" :max="9999" clearable />
            </div>
          </div>

          <div class="row2">
            <NSpace align="center" size="small">
              <NSwitch v-model:value="enableDedup" />
              <span class="inline-label">{{ t('run.advanced.enableDedup') }}</span>
            </NSpace>
            <div>
              <label class="label">{{ t('run.advanced.redownloadThreshold') }}</label>
              <NInputNumber v-model:value="redownloadThreshold" :min="0" :max="1" :step="0.05" clearable />
            </div>
          </div>

          <div class="row inline">
            <NSpace align="center" size="large">
              <NSpace align="center" size="small">
                <NSwitch v-model:value="noRcloneFilter" />
                <span class="inline-label">{{ t('run.advanced.noRcloneFilter') }}</span>
              </NSpace>
              <NSpace align="center" size="small">
                <NSwitch v-model:value="disableAllFilters" />
                <span class="inline-label">{{ t('run.advanced.disableAllFilters') }}</span>
              </NSpace>
            </NSpace>
          </div>
        </div>
      </NCollapseItem>
    </NCollapse>

    <div class="submit-row">
      <NButton type="primary" size="large" :loading="submitting" :disabled="submitting" @click="onSubmit">
        {{ t('run.submitButton') }}
      </NButton>
    </div>
  </div>
</template>

<style scoped>
.run-form { display: flex; flex-direction: column; gap: 16px; }
.row { display: flex; flex-direction: column; gap: 6px; }
.row.inline { flex-direction: row; align-items: center; }
.row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.label { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--n-text-color); }
.inline-label { font-size: 13px; color: var(--n-text-color); }
.hint { font-size: 11px; color: var(--n-text-color-disabled); }
.advanced { display: flex; flex-direction: column; gap: 12px; padding-top: 8px; }
.submit-row { margin-top: 8px; }
</style>
