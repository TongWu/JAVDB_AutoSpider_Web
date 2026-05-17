import { http } from './client'
import type { ResponseFor } from './_typed'

export type CapabilitiesResponse = ResponseFor<'/api/capabilities', 'get'>
// Re-export field types for callers (e.g. IngestionMode is used by Sidebar/HomePage)
export type IngestionMode = NonNullable<CapabilitiesResponse>['ingestion_mode']
export type GhActionsTier = NonNullable<CapabilitiesResponse>['gh_actions']['tier']
export type StorageBackend = NonNullable<CapabilitiesResponse>['storage_backend']
export type Deployment = NonNullable<CapabilitiesResponse>['deployment']

export async function apiCapabilities(): Promise<CapabilitiesResponse> {
  const { data } = await http.get<CapabilitiesResponse>('/api/capabilities')
  return data
}
