import { http } from './client'

export type IngestionMode = 'local' | 'github' | 'dual'
export type GhActionsTier = 'none' | 'monitor' | 'edit' | 'admin'
export type StorageBackend = 'sqlite' | 'd1' | 'dual'
export type Deployment = 'colocated' | 'split' | 'unknown'

export interface CapabilitiesResponse {
  version: string
  ingestion_mode: IngestionMode
  gh_actions: { tier: GhActionsTier; repo: string | null; token_configured: boolean }
  storage_backend: StorageBackend
  features: {
    pikpak: boolean
    rclone: boolean
    smtp: boolean
    proxy_pool: boolean
    javdb_login: boolean
    proxy_preview: boolean
  }
  deployment: Deployment
  build: { frontend_version: string | null; backend_version: string; git_sha: string }
}

export async function apiCapabilities(): Promise<CapabilitiesResponse> {
  const { data } = await http.get<CapabilitiesResponse>('/api/capabilities')
  return data
}
