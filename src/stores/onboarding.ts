import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useStorage } from '@vueuse/core'
import type { OnboardingStatus, OnboardingTestResponse } from '@/api/onboarding'
import {
  apiOnboardingStatus,
  apiOnboardingTest,
  apiOnboardingComplete,
  apiDismissHint,
} from '@/api/onboarding'
import { http } from '@/api/client'

export type OnboardingStep = 1 | 2 | 3 | 4 | 5
export type ComponentName = 'javdb' | 'qb' | 'proxy' | 'smtp'

export const useOnboardingStore = defineStore('onboarding', () => {
  const status = ref<OnboardingStatus | null>(null)
  // Per-step form data, persisted to sessionStorage so the user can refresh mid-wizard.
  const stepValues = useStorage<Record<string, Record<string, unknown>>>(
    'onboarding:step-values',
    {},
    sessionStorage,
  )
  // Per-component test results.
  const testResults = useStorage<Record<string, OnboardingTestResponse>>(
    'onboarding:test-results',
    {},
    sessionStorage,
  )
  const currentStep = useStorage<OnboardingStep>(
    'onboarding:current-step',
    1,
    sessionStorage,
  )
  const loading = ref(false)
  const error = ref<unknown>(null)
  // Snapshot of GET /api/config for pre-populating onboarding step fields
  const configSnapshot = ref<Record<string, unknown> | null>(null)

  const isCompleted = computed(() => status.value?.completed ?? false)

  async function fetchStatus(): Promise<OnboardingStatus> {
    loading.value = true
    error.value = null
    try {
      const data = await apiOnboardingStatus()
      status.value = data
      return data
    } catch (err) {
      error.value = err
      throw err
    } finally {
      loading.value = false
    }
  }

  function setCurrentStep(step: OnboardingStep) {
    currentStep.value = step
  }

  function setStepValue(step: OnboardingStep, key: string, val: unknown) {
    const stepKey = `step${step}`
    const existing = stepValues.value[stepKey] ?? {}
    stepValues.value = { ...stepValues.value, [stepKey]: { ...existing, [key]: val } }
  }

  function getStepValue<T = unknown>(step: OnboardingStep, key: string, fallback: T): T {
    return ((stepValues.value[`step${step}`] ?? {})[key] as T | undefined) ?? fallback
  }

  async function fetchConfigSnapshot(): Promise<Record<string, unknown>> {
    const { data } = await http.get<Record<string, unknown>>('/api/config')
    configSnapshot.value = data
    return data
  }

  async function runTest(component: ComponentName): Promise<OnboardingTestResponse> {
    const result = await apiOnboardingTest(component)
    testResults.value = { ...testResults.value, [component]: result }
    return result
  }

  async function completeOnboarding(): Promise<void> {
    await apiOnboardingComplete()
    if (status.value) status.value = { ...status.value, completed: true }
    // Clear session storage state since we no longer need it
    stepValues.value = {}
    testResults.value = {}
    currentStep.value = 1
  }

  async function dismissHint(hintId: string): Promise<void> {
    await apiDismissHint(hintId)
  }

  return {
    status,
    stepValues,
    testResults,
    currentStep,
    loading,
    error,
    isCompleted,
    configSnapshot,
    fetchStatus,
    fetchConfigSnapshot,
    setCurrentStep,
    setStepValue,
    getStepValue,
    runTest,
    completeOnboarding,
    dismissHint,
  }
})
