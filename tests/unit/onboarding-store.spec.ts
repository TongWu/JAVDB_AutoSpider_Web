import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const status = {
  completed: false,
  required_missing: ['javdb_session', 'qb'],
  skippable_missing: ['smtp', 'pikpak'],
}
const apiStatusSpy = vi.fn(async () => status)
const apiTestSpy = vi.fn(async () => ({ component: 'javdb', ok: true, message: 'ok' }))
const apiCompleteSpy = vi.fn(async () => undefined)
const apiDismissSpy = vi.fn(async () => undefined)

vi.mock('@/api/onboarding', () => ({
  apiOnboardingStatus: () => apiStatusSpy(),
  apiOnboardingTest: (c: string) => apiTestSpy(c),
  apiOnboardingComplete: () => apiCompleteSpy(),
  apiDismissHint: (id: string) => apiDismissSpy(id),
}))

import { useOnboardingStore } from '@/stores/onboarding'

describe('onboarding store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    sessionStorage.clear()
    apiStatusSpy.mockClear()
    apiTestSpy.mockClear()
    apiCompleteSpy.mockClear()
    apiDismissSpy.mockClear()
  })

  it('fetchStatus populates status', async () => {
    const ob = useOnboardingStore()
    const result = await ob.fetchStatus()
    expect(result.completed).toBe(false)
    expect(ob.status?.required_missing).toContain('javdb_session')
  })

  it('setStepValue persists per-step', () => {
    const ob = useOnboardingStore()
    ob.setStepValue(2, 'cookie', 'abc')
    expect(ob.getStepValue(2, 'cookie', '')).toBe('abc')
    expect(ob.getStepValue(2, 'missing', 'fallback')).toBe('fallback')
  })

  it('runTest stores result per component', async () => {
    const ob = useOnboardingStore()
    await ob.runTest('javdb')
    expect(ob.testResults.javdb?.ok).toBe(true)
  })

  it('completeOnboarding flips status and clears wizard state', async () => {
    const ob = useOnboardingStore()
    await ob.fetchStatus()
    ob.setStepValue(2, 'cookie', 'x')
    ob.setCurrentStep(5)
    await ob.completeOnboarding()
    expect(ob.isCompleted).toBe(true)
    expect(ob.currentStep).toBe(1)
    expect(ob.getStepValue(2, 'cookie', null)).toBe(null)
  })
})
