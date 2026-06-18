import { beforeEach, describe, expect, it, vi } from 'vitest'

const getSpy = vi.fn()
const putSpy = vi.fn()

vi.mock('@/api/client', () => ({
  http: {
    get: (...args: unknown[]) => getSpy(...args),
    put: (...args: unknown[]) => putSpy(...args),
  },
}))

import {
  listAlertEvents,
  listAlertPolicies,
  upsertAlertPolicy,
} from '@/api/diagnostics'

describe('ops alerting config API', () => {
  beforeEach(() => {
    getSpy.mockReset()
    putSpy.mockReset()
  })

  it('lists alert policies', async () => {
    getSpy.mockResolvedValueOnce({ data: { items: [] } })

    await listAlertPolicies()

    expect(getSpy).toHaveBeenCalledWith('/api/diag/alert-policies')
  })

  it('upserts an alert policy', async () => {
    putSpy.mockResolvedValueOnce({
      data: { incident_type: 'failed_ingestion', min_confidence: 'high', enabled: true, channels: ['email'] },
    })

    const result = await upsertAlertPolicy('failed_ingestion', {
      min_confidence: 'high',
      enabled: true,
      channels: ['email'],
    })

    expect(result.min_confidence).toBe('high')
    expect(putSpy).toHaveBeenCalledWith('/api/diag/alert-policies/failed_ingestion', {
      min_confidence: 'high',
      enabled: true,
      channels: ['email'],
    })
  })

  it('lists alert events for an incident', async () => {
    getSpy.mockResolvedValueOnce({ data: { items: [] } })

    await listAlertEvents('opsinc_test')

    expect(getSpy).toHaveBeenCalledWith('/api/diag/ops-incidents/opsinc_test/alert-events')
  })

  it('encodes the incident type when upserting an alert policy', async () => {
    putSpy.mockResolvedValueOnce({ data: {} })

    await upsertAlertPolicy('type/with space', {
      min_confidence: 'low',
      enabled: true,
      channels: ['email'],
    })

    expect(putSpy).toHaveBeenCalledWith(
      '/api/diag/alert-policies/type%2Fwith%20space',
      expect.any(Object),
    )
  })

  it('encodes the incident id when listing alert events', async () => {
    getSpy.mockResolvedValueOnce({ data: { items: [] } })

    await listAlertEvents('opsinc/a b')

    expect(getSpy).toHaveBeenCalledWith('/api/diag/ops-incidents/opsinc%2Fa%20b/alert-events')
  })
})
