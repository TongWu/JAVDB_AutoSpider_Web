<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NSpace, NButton, NRadioGroup, NRadio, NInput, NCheckbox, NCheckboxGroup, NAlert, useMessage,
} from 'naive-ui'
import { useOnboardingStore } from '@/stores/onboarding'
import { http } from '@/api/client'
import ProxyPoolEditor, { type ProxyEntry } from '@/components/ProxyPoolEditor.vue'

type ProxyMode = 'none' | 'single' | 'pool'

const { t } = useI18n()
const ob = useOnboardingStore()
const message = useMessage()

/** Return empty string if the value is a mask placeholder (e.g. "***"). */
function unmask(val: unknown): string {
  if (typeof val !== 'string') return ''
  if (/^\*+$/.test(val.trim())) return ''
  return val
}

// Derive proxy mode from config snapshot if not set in session-store
function resolveMode(): ProxyMode {
  const stored = ob.getStepValue<string>(4, 'mode', '')
  if (stored === 'single' || stored === 'pool' || stored === 'none') return stored
  const snapshotMode = unmask(ob.configSnapshot?.PROXY_MODE).toLowerCase()
  if (snapshotMode === 'single') return 'single'
  if (snapshotMode === 'pool') return 'pool'
  return 'none'
}

function resolvePool(): ProxyEntry[] {
  const stored = ob.getStepValue<ProxyEntry[]>(4, 'pool', [])
  if (stored && stored.length > 0) return stored
  const snap = ob.configSnapshot?.PROXY_POOL
  if (Array.isArray(snap)) {
    return snap.map((entry) => ({
      name: typeof entry === 'object' && entry !== null && 'name' in entry ? String((entry as { name?: unknown }).name ?? '') : '',
      http: typeof entry === 'object' && entry !== null && 'http' in entry ? String((entry as { http?: unknown }).http ?? '') : '',
      https: typeof entry === 'object' && entry !== null && 'https' in entry ? String((entry as { https?: unknown }).https ?? '') : '',
    }))
  }
  return []
}

function resolveModules(): string[] {
  const stored = ob.getStepValue<string[]>(4, 'modules', [])
  if (Array.isArray(stored) && stored.length > 0) return stored
  const snap = ob.configSnapshot?.PROXY_MODULES
  if (Array.isArray(snap) && snap.length > 0) return snap.map(String)
  return ['spider']
}

const mode = ref<ProxyMode>(resolveMode())
const singleUrl = ref<string>(
  ob.getStepValue<string>(4, 'singleUrl', '') ||
  unmask(ob.configSnapshot?.PROXY_HTTP),
)
const pool = ref<ProxyEntry[]>(resolvePool())
const modules = ref<string[]>(resolveModules())
const testing = ref(false)

watch(mode, (v) => ob.setStepValue(4, 'mode', v))
watch(singleUrl, (v) => ob.setStepValue(4, 'singleUrl', v))
watch(pool, (v) => ob.setStepValue(4, 'pool', v), { deep: true })
watch(modules, (v) => ob.setStepValue(4, 'modules', v))

// Re-resolve from snapshot if it arrives after this step mounts (race with OnboardingPage mount)
watch(() => ob.configSnapshot, (snap) => {
  if (!snap) return
  const storedPool = ob.getStepValue<ProxyEntry[]>(4, 'pool', [])
  if (!storedPool || storedPool.length === 0) {
    const newPool = resolvePool()
    if (newPool.length > 0) pool.value = newPool
  }
  const storedModules = ob.getStepValue<string[]>(4, 'modules', [])
  if (!Array.isArray(storedModules) || storedModules.length === 0) {
    const newModules = resolveModules()
    if (newModules.length > 0) modules.value = newModules
  }
  // Mode may also have come in late
  if (mode.value === 'none') {
    const snapshotMode = unmask(snap.PROXY_MODE).toLowerCase()
    if (snapshotMode === 'single' || snapshotMode === 'pool') {
      mode.value = snapshotMode as ProxyMode
    }
  }
}, { immediate: true })

// "All" is exclusive with the rest
function onModulesChange(next: (string | number)[]) {
  const strs = next.map(String)
  if (strs.includes('all') && !modules.value.includes('all')) {
    modules.value = ['all']
    return
  }
  if (strs.includes('all') && modules.value.includes('all') && strs.length > 1) {
    // user added another while 'all' was set — drop 'all'
    modules.value = strs.filter(m => m !== 'all')
    return
  }
  modules.value = strs
}

async function runTest() {
  testing.value = true
  try {
    // Persist current proxy settings before running the test
    await http.put(
      '/api/config',
      {
        PROXY_MODE: mode.value,
        PROXY_HTTP: singleUrl.value || '',
        PROXY_POOL: pool.value,
        PROXY_MODULES: modules.value,
      },
      { skipErrorToast: true },
    )
    await ob.runTest('proxy')
  } catch (err) {
    console.error(err)
  } finally {
    testing.value = false
  }
}

const result = computed(() => ob.testResults.proxy)
const testOk = computed(() => result.value?.ok === true)

// "None" mode is always continuable (no test needed)
const canContinue = computed(() => mode.value === 'none' || testOk.value)

function back() { ob.setCurrentStep(3) }
function skip() { ob.setCurrentStep(5) }
function next() {
  if (!canContinue.value) {
    message.warning(t('onboarding.proxy.testFirst'))
    return
  }
  ob.setCurrentStep(5)
}
</script>

<template>
  <div class="step-content">
    <h2>{{ t('onboarding.proxy.title') }}</h2>
    <p class="lead">
      {{ t('onboarding.proxy.body') }}
    </p>

    <NSpace
      vertical
      size="large"
    >
      <div>
        <label class="label">{{ t('onboarding.proxy.modeLabel') }}</label>
        <NRadioGroup v-model:value="mode">
          <NSpace>
            <NRadio value="none">
              {{ t('onboarding.proxy.modeNone') }}
            </NRadio>
            <NRadio value="single">
              {{ t('onboarding.proxy.modeSingle') }}
            </NRadio>
            <NRadio value="pool">
              {{ t('onboarding.proxy.modePool') }}
            </NRadio>
          </NSpace>
        </NRadioGroup>
      </div>

      <div v-if="mode === 'single'">
        <label class="label">{{ t('onboarding.proxy.singleUrlLabel') }}</label>
        <NInput
          v-model:value="singleUrl"
          :placeholder="t('onboarding.proxy.singleUrlPlaceholder')"
        />
      </div>

      <div v-if="mode === 'pool'">
        <label class="label">{{ t('onboarding.proxy.poolLabel') }}</label>
        <ProxyPoolEditor v-model="pool" />
      </div>

      <div>
        <label class="label">{{ t('onboarding.proxy.modulesLabel') }}</label>
        <NCheckboxGroup
          :value="modules"
          @update:value="onModulesChange"
        >
          <NSpace>
            <NCheckbox value="spider">
              {{ t('onboarding.proxy.moduleSpider') }}
            </NCheckbox>
            <NCheckbox value="qbittorrent">
              {{ t('onboarding.proxy.moduleQb') }}
            </NCheckbox>
            <NCheckbox value="pikpak">
              {{ t('onboarding.proxy.modulePikpak') }}
            </NCheckbox>
            <NCheckbox value="all">
              {{ t('onboarding.proxy.moduleAll') }}
            </NCheckbox>
          </NSpace>
        </NCheckboxGroup>
        <p class="hint">
          {{ t('onboarding.proxy.modulesHint') }}
        </p>
      </div>

      <NSpace v-if="mode !== 'none'">
        <NButton
          type="primary"
          :loading="testing"
          @click="runTest"
        >
          {{ t('onboarding.proxy.testButton') }}
        </NButton>
      </NSpace>

      <NAlert
        v-if="result && mode !== 'none'"
        :type="testOk ? 'success' : 'error'"
        :title="testOk ? t('onboarding.proxy.testPassed') : t('onboarding.proxy.testFailed')"
      >
        {{ result.message }}
      </NAlert>
    </NSpace>

    <div class="actions">
      <NButton @click="back">
        {{ t('common.back') }}
      </NButton>
      <NSpace>
        <NButton
          tertiary
          @click="skip"
        >
          {{ t('common.skip') }}
        </NButton>
        <NButton
          type="primary"
          :disabled="!canContinue"
          @click="next"
        >
          {{ t('common.continue') }}
        </NButton>
      </NSpace>
    </div>
  </div>
</template>

<style scoped>
.step-content { display: flex; flex-direction: column; gap: 16px; }
.step-content h2 { font-size: 20px; font-weight: 700; margin: 0; letter-spacing: -0.02em; }
.lead { color: var(--n-text-color-2); font-size: 13px; line-height: 1.6; margin: 0; }
.label { display: block; font-size: 12px; font-weight: 600; color: var(--n-text-color); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.05em; }
.hint { font-size: 11px; color: var(--n-text-color-disabled); margin: 6px 0 0; }
.actions { display: flex; justify-content: space-between; align-items: center; margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--n-divider-color, #eee); }
</style>
