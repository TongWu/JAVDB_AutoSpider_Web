import type { components } from '@/types/api.gen'
import { http } from './client'

export type ConfigType = 'bool' | 'int' | 'float' | 'json' | 'string'

export interface ConfigMetaField {
  key: string
  section: string
  type: ConfigType
  sensitive: boolean
  readonly: boolean
}

export interface ConfigMetaResponse {
  fields: ConfigMetaField[]
}

export type ConfigValues = Record<string, unknown>

export async function apiGetConfig(includeSecrets = false): Promise<ConfigValues> {
  const { data } = await http.get<ConfigValues>('/api/config', {
    params: includeSecrets ? { include_secrets: true } : undefined,
  })
  return data
}

export async function apiGetConfigMeta(): Promise<ConfigMetaResponse> {
  const { data } = await http.get<ConfigMetaResponse>('/api/config/meta')
  return data
}

export async function apiUpdateConfig(patch: ConfigValues): Promise<{ status?: string }> {
  const { data } = await http.put<{ status?: string }>('/api/config', patch)
  return data
}


export type ConfigConsumerEvidence = components['schemas']['ConfigConsumer']
export type ConfigConsumers = components['schemas']['ConfigConsumersResponse']
export type ConfigJobSnapshots = components['schemas']['ConfigJobSnapshotsResponse']

export async function apiGetConfigConsumers(): Promise<ConfigConsumers> {
  const { data } = await http.get<ConfigConsumers>('/api/config/consumers')
  return data
}

export async function apiGetJobConfigSnapshots(jobId: string): Promise<ConfigJobSnapshots> {
  const { data } = await http.get<ConfigJobSnapshots>(`/api/config/job-snapshots/${encodeURIComponent(jobId)}`)
  return data
}
