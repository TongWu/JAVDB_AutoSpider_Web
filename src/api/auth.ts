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
