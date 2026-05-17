import { http } from './client'

export interface LoginResponse {
  access_token: string
  refresh_token: string
  csrf_token: string
  role: 'admin' | 'readonly'
  expires_in: number
  username: string
}

export interface RefreshResponse {
  access_token: string
  expires_in: number
}

export async function apiLogin(username: string, password: string): Promise<LoginResponse> {
  const { data } = await http.post<LoginResponse>('/api/auth/login', { username, password })
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
