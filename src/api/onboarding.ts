import { http } from './client'
import type { ResponseFor, RequestBodyFor } from './_typed'

export type OnboardingStatus = ResponseFor<'/api/onboarding/status', 'get'>
export type OnboardingTestPayload = RequestBodyFor<'/api/onboarding/test', 'post'>
export type OnboardingTestResponse = ResponseFor<'/api/onboarding/test', 'post'>
export type DismissHintPayload = RequestBodyFor<'/api/onboarding/dismiss-hint', 'post'>

export async function apiOnboardingStatus(): Promise<OnboardingStatus> {
  const { data } = await http.get<OnboardingStatus>('/api/onboarding/status')
  return data
}

export async function apiOnboardingTest(
  component: 'javdb' | 'qb' | 'proxy' | 'smtp',
): Promise<OnboardingTestResponse> {
  const { data } = await http.post<OnboardingTestResponse>('/api/onboarding/test', { component })
  return data
}

export async function apiOnboardingComplete(): Promise<void> {
  await http.post('/api/onboarding/complete')
}

export async function apiDismissHint(hintId: string): Promise<void> {
  await http.post('/api/onboarding/dismiss-hint', { hint_id: hintId })
}
