import { http } from './client'
import type { RequestBodyFor, ResponseFor } from './_typed'

export type LoginPayload = RequestBodyFor<'/api/auth/login', 'post'>
export type LoginResponse = ResponseFor<'/api/auth/login', 'post'>
// refresh endpoint carries the token via cookie/header in the schema, not request body
export type RefreshResponse = ResponseFor<'/api/auth/refresh', 'post'>

export async function apiLogin(username: string, password: string): Promise<LoginResponse> {
  const { data } = await http.post<LoginResponse>('/api/auth/login', { username, password } as LoginPayload)
  return data
}

export async function apiRefresh(refreshToken: string): Promise<RefreshResponse> {
  const { data } = await http.post<RefreshResponse>('/api/auth/refresh', {
    refresh_token: refreshToken,
  })
  return data
}

export async function apiLogout(): Promise<void> {
  await http.post('/api/auth/logout')
}

// `/api/auth/change-password` was added after the last openapi.json snapshot,
// so we hand-type the request/response shapes until `api.gen.ts` is regenerated.
export interface ChangePasswordRequest {
  current_password: string
  new_password: string
}

export interface ChangePasswordResponse {
  status: 'ok'
}

export async function apiChangePassword(
  currentPassword: string,
  newPassword: string,
): Promise<ChangePasswordResponse> {
  const { data } = await http.post<ChangePasswordResponse>(
    '/api/auth/change-password',
    {
      current_password: currentPassword,
      new_password: newPassword,
    } as ChangePasswordRequest,
  )
  return data
}
