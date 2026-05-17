import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const triggerSpy = vi.fn()
const completeSpy = vi.fn()
const dismissSpy = vi.fn()

vi.mock('@/api/tasks', () => ({
  apiTriggerDaily: (...args: unknown[]) => triggerSpy(...args),
}))
vi.mock('@/api/onboarding', () => ({
  apiOnboardingStatus: vi.fn(async () => ({
    completed: false,
    required_missing: [],
    skippable_missing: [],
  })),
  apiOnboardingTest: vi.fn(),
  apiOnboardingComplete: () => completeSpy(),
  apiDismissHint: (id: string) => dismissSpy(id),
}))

import { useOnboardingStore } from '@/stores/onboarding'

describe('Onboarding step 5 — first run', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    sessionStorage.clear()
    triggerSpy.mockReset()
    completeSpy.mockReset()
    dismissSpy.mockReset()
  })

  it('completeOnboarding calls apiOnboardingComplete', async () => {
    const ob = useOnboardingStore()
    completeSpy.mockResolvedValue(undefined)
    await ob.completeOnboarding()
    expect(completeSpy).toHaveBeenCalledTimes(1)
  })

  it('dismissHint calls apiDismissHint with id', async () => {
    const ob = useOnboardingStore()
    dismissSpy.mockResolvedValue(undefined)
    await ob.dismissHint('smtp')
    expect(dismissSpy).toHaveBeenCalledWith('smtp')
  })
})
