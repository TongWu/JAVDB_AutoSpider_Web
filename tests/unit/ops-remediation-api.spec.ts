import { describe, expect, it, vi } from 'vitest'
import { http } from '@/api/client'
import { decideRemediationProposal, listRemediationProposals } from '@/api/diagnostics'

describe('ops remediation proposal API', () => {
  it('lists proposals for an incident', async () => {
    const spy = vi.spyOn(http, 'get').mockResolvedValueOnce({ data: { items: [] } })
    await listRemediationProposals('opsinc_test')
    expect(spy).toHaveBeenCalledWith('/api/diag/ops-incidents/opsinc_test/remediation-proposals')
  })

  it('records proposal decision', async () => {
    const spy = vi.spyOn(http, 'post').mockResolvedValueOnce({ data: { proposal_id: 'opsprop_test', status: 'approved' } })
    const result = await decideRemediationProposal('opsprop_test', { status: 'approved', decision_note: 'Reviewed.' })
    expect(result.status).toBe('approved')
    expect(spy).toHaveBeenCalledWith('/api/diag/remediation-proposals/opsprop_test/decision', { status: 'approved', decision_note: 'Reviewed.' })
  })
})
