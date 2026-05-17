<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NSpace, NButton, NRadioGroup, NRadio, NInput, NCheckbox, NCheckboxGroup, NAlert, useMessage,
} from 'naive-ui'
import { useOnboardingStore } from '@/stores/onboarding'
import ProxyPoolEditor, { type ProxyEntry } from '@/components/ProxyPoolEditor.vue'

type ProxyMode = 'none' | 'single' | 'pool'

const { t } = useI18n()
const ob = useOnboardingStore()
const message = useMessage()

const mode = ref<ProxyMode>(ob.getStepValue<ProxyMode>(4, 'mode', 'none'))
const singleUrl = ref<string>(ob.getStepValue<string>(4, 'singleUrl', ''))
const pool = ref<ProxyEntry[]>(ob.getStepValue<ProxyEntry[]>(4, 'pool', []))
const modules = ref<string[]>(ob.getStepValue<string[]>(4, 'modules', ['spider']))
const testing = ref(false)

watch(mode, (v) => ob.setStepValue(4, 'mode', v))
watch(singleUrl, (v) => ob.setStepValue(4, 'singleUrl', v))
watch(pool, (v) => ob.setStepValue(4, 'pool', v), { deep: true })
watch(modules, (v) => ob.setStepValue(4, 'modules', v))

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
    <p class="lead">{{ t('onboarding.proxy.body') }}</p>

    <NSpace vertical size="large">
      <div>
        <label class="label">{{ t('onboarding.proxy.modeLabel') }}</label>
        <NRadioGroup v-model:value="mode">
          <NSpace>
            <NRadio value="none">{{ t('onboarding.proxy.modeNone') }}</NRadio>
            <NRadio value="single">{{ t('onboarding.proxy.modeSingle') }}</NRadio>
            <NRadio value="pool">{{ t('onboarding.proxy.modePool') }}</NRadio>
          </NSpace>
        </NRadioGroup>
      </div>

      <div v-if="mode === 'single'">
        <label class="label">{{ t('onboarding.proxy.singleUrlLabel') }}</label>
        <NInput v-model:value="singleUrl" :placeholder="t('onboarding.proxy.singleUrlPlaceholder')" />
      </div>

      <div v-if="mode === 'pool'">
        <label class="label">{{ t('onboarding.proxy.poolLabel') }}</label>
        <ProxyPoolEditor v-model="pool" />
      </div>

      <div>
        <label class="label">{{ t('onboarding.proxy.modulesLabel') }}</label>
        <NCheckboxGroup :value="modules" @update:value="onModulesChange">
          <NSpace>
            <NCheckbox value="spider">{{ t('onboarding.proxy.moduleSpider') }}</NCheckbox>
            <NCheckbox value="qbittorrent">{{ t('onboarding.proxy.moduleQb') }}</NCheckbox>
            <NCheckbox value="pikpak">{{ t('onboarding.proxy.modulePikpak') }}</NCheckbox>
            <NCheckbox value="all">{{ t('onboarding.proxy.moduleAll') }}</NCheckbox>
          </NSpace>
        </NCheckboxGroup>
        <p class="hint">{{ t('onboarding.proxy.modulesHint') }}</p>
      </div>

      <NSpace v-if="mode !== 'none'">
        <NButton type="primary" :loading="testing" @click="runTest">
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
      <NButton @click="back">{{ t('common.back') }}</NButton>
      <NSpace>
        <NButton text @click="skip">{{ t('common.skip') }}</NButton>
        <NButton type="primary" :disabled="!canContinue" @click="next">
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
