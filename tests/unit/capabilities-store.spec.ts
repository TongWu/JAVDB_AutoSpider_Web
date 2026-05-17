import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const stubResponse = {
  version: '2.0.0',
  ingestion_mode: 'local' as const,
  gh_actions: { tier: 'none' as const, repo: null, token_configured: false },
  storage_backend: 'sqlite' as const,
  features: { pikpak: false, rclone: false, smtp: true, proxy_pool: true, javdb_login: true, proxy_preview: true },
  deployment: 'colocated' as const,
  build: { frontend_version: null, backend_version: '2.1.3', git_sha: 'abc1234' },
}

const apiSpy = vi.fn(async () => stubResponse)
vi.mock('@/api/capabilities', () => ({ apiCapabilities: () => apiSpy() }))

import { useCapabilitiesStore } from '@/stores/capabilities'

describe('capabilities store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    apiSpy.mockClear()
  })

  it('fetchInitial populates data', async () => {
    const cap = useCapabilitiesStore()
    expect(cap.data).toBe(null)
    const r = await cap.fetchInitial()
    expect(r.version).toBe('2.0.0')
    expect(cap.data?.ingestion_mode).toBe('local')
    expect(apiSpy).toHaveBeenCalledTimes(1)
  })

  it('caches: second fetchInitial within TTL does not refetch', async () => {
    const cap = useCapabilitiesStore()
    await cap.fetchInitial()
    await cap.fetchInitial()
    expect(apiSpy).toHaveBeenCalledTimes(1)
  })

  it('invalidate forces a refetch', async () => {
    const cap = useCapabilitiesStore()
    await cap.fetchInitial()
    cap.invalidate()
    await cap.fetchInitial()
    expect(apiSpy).toHaveBeenCalledTimes(2)
  })

  it('refresh always hits API', async () => {
    const cap = useCapabilitiesStore()
    await cap.fetchInitial()
    await cap.refresh()
    expect(apiSpy).toHaveBeenCalledTimes(2)
  })
})
