import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const getSpy = vi.fn()
const metaSpy = vi.fn()
const putSpy = vi.fn()

vi.mock('@/api/config', () => ({
  apiGetConfig: () => getSpy(),
  apiGetConfigMeta: () => metaSpy(),
  apiUpdateConfig: (patch: Record<string, unknown>) => putSpy(patch),
}))

import { useConfigStore } from '@/stores/config'

const sampleValues = {
  QB_URL: 'http://qb.example:8080',
  QB_PASSWORD: '********',
  STRICT_DUAL_WRITE: false,
  NUM_CLAIM_SHARDS: 4,
}

const sampleMeta = {
  fields: [
    { key: 'QB_URL', section: 'qbittorrent', type: 'string', sensitive: false, readonly: false },
    { key: 'QB_PASSWORD', section: 'qbittorrent', type: 'string', sensitive: true, readonly: false },
    { key: 'STRICT_DUAL_WRITE', section: 'core', type: 'bool', sensitive: false, readonly: false },
    { key: 'NUM_CLAIM_SHARDS', section: 'advanced', type: 'int', sensitive: false, readonly: false },
  ],
}

describe('config store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    getSpy.mockReset()
    metaSpy.mockReset()
    putSpy.mockReset()
    getSpy.mockResolvedValue({ ...sampleValues })
    metaSpy.mockResolvedValue(sampleMeta)
    putSpy.mockResolvedValue({ status: 'ok' })
  })

  it('fetch populates values + meta', async () => {
    const config = useConfigStore()
    await config.fetch()
    expect(Object.keys(config.values).length).toBe(4)
    expect(config.meta.length).toBe(4)
    expect(config.isDirty).toBe(false)
  })

  it('set marks dirty and tracks changed keys', async () => {
    const config = useConfigStore()
    await config.fetch()
    config.set('STRICT_DUAL_WRITE', true)
    expect(config.isDirty).toBe(true)
    expect(config.dirtyKeys).toEqual(['STRICT_DUAL_WRITE'])
  })

  it('discard reverts values to initial', async () => {
    const config = useConfigStore()
    await config.fetch()
    config.set('QB_URL', 'http://changed:8080')
    expect(config.isDirty).toBe(true)
    config.discard()
    expect(config.isDirty).toBe(false)
    expect(config.values.QB_URL).toBe('http://qb.example:8080')
  })

  it('save sends only dirty keys + refreshes', async () => {
    const config = useConfigStore()
    await config.fetch()
    config.set('STRICT_DUAL_WRITE', true)
    config.set('NUM_CLAIM_SHARDS', 8)
    await config.save()
    expect(putSpy).toHaveBeenCalledWith({
      STRICT_DUAL_WRITE: true,
      NUM_CLAIM_SHARDS: 8,
    })
    expect(getSpy).toHaveBeenCalledTimes(2)  // initial fetch + post-save refetch
  })

  it('groupedFields groups by section', async () => {
    const config = useConfigStore()
    await config.fetch()
    expect(Object.keys(config.groupedFields).sort()).toEqual(['advanced', 'core', 'qbittorrent'])
    expect(config.groupedFields.qbittorrent.length).toBe(2)
  })

  it('orderedSections puts known sections first', async () => {
    const config = useConfigStore()
    await config.fetch()
    // Sample meta declares sections "qbittorrent", "core", "advanced". The
    // canonical SECTION_ORDER lists qbittorrent and advanced (known); "core"
    // is not a BE-emitted section name and falls through to the tail.
    expect(config.orderedSections).toEqual(['qbittorrent', 'advanced', 'core'])
  })

  it('save is a no-op when nothing is dirty', async () => {
    const config = useConfigStore()
    await config.fetch()
    await config.save()
    expect(putSpy).not.toHaveBeenCalled()
  })
})
