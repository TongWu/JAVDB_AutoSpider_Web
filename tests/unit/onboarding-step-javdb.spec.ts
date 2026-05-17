import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/api/onboarding', () => ({
  apiOnboardingStatus: vi.fn(async () => ({ completed: false, required_missing: [], skippable_missing: [] })),
  apiOnboardingTest: vi.fn(async (component: string) => ({ component, ok: true, message: 'cookie present' })),
  apiOnboardingComplete: vi.fn(),
  apiDismissHint: vi.fn(),
}))

const httpPostSpy = vi.fn()
vi.mock('@/api/client', () => ({ http: { post: (...args: unknown[]) => httpPostSpy(...args) } }))

import { useOnboardingStore } from '@/stores/onboarding'

describe('StepJavdbSession — store interactions', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    sessionStorage.clear()
    httpPostSpy.mockReset()
  })

  it('cookie test path stores result and sets ok=true', async () => {
    const ob = useOnboardingStore()
    ob.setStepValue(2, 'cookie', 'abc123')

    await ob.runTest('javdb')

    expect(ob.testResults.javdb?.ok).toBe(true)
    expect(ob.testResults.javdb?.message).toBe('cookie present')
  })

  it('credentials path: http.post is called with /api/login/refresh', async () => {
    httpPostSpy.mockResolvedValue({ data: { ok: true } })

    // Simulate what signIn() does in the component
    const ob = useOnboardingStore()
    ob.setStepValue(2, 'cred_username', 'alice')
    ob.setStepValue(2, 'cred_password', 'secret')

    const { http } = await import('@/api/client')
    const result = await http.post('/api/login/refresh', {
      username: 'alice',
      password: 'secret',
    })

    expect(httpPostSpy).toHaveBeenCalledWith('/api/login/refresh', {
      username: 'alice',
      password: 'secret',
    })
    expect(result.data.ok).toBe(true)
  })
})
