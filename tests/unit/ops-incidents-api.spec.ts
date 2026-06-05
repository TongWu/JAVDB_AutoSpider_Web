import { beforeEach, describe, expect, it, vi } from 'vitest'

const getSpy = vi.fn()

vi.mock('@/api/client', () => ({
  http: { get: (...args: unknown[]) => getSpy(...args) },
}))

import { getOpsIncidentAnalytics, listOpsIncidents } from '@/api/diagnostics'

describe('ops incidents diagnostics API', () => {
  beforeEach(() => {
    getSpy.mockReset()
  })

  it('lists incidents with filters', async () => {
    getSpy.mockResolvedValueOnce({ data: { items: [] } })

    const result = await listOpsIncidents({ incident_type: 'failed_ingestion', confidence: 'low' })

    expect(result.items).toEqual([])
    expect(getSpy).toHaveBeenCalledWith('/api/diag/ops-incidents', {
      params: { incident_type: 'failed_ingestion', confidence: 'low' },
    })
  })

  it('loads analytics', async () => {
    getSpy.mockResolvedValueOnce({
      data: {
        total: 1,
        by_type: { failed_ingestion: 1 },
        by_status: { open: 1 },
        by_confidence: { low: 1 },
        open_high_confidence: 0,
      },
    })

    const result = await getOpsIncidentAnalytics()

    expect(result.total).toBe(1)
    expect(result.by_type.failed_ingestion).toBe(1)
  })
})
