import { test, expect } from '@playwright/test'
import { loginViaUi, markOnboarded, resetBackend } from './fixtures/auth'

test.describe('Ops remediation proposal review', () => {
  test.beforeEach(async ({ request, page }) => {
    await resetBackend(request)
    await markOnboarded(request, page)
    await page.route('**/api/diag/ops-incidents', async (route) => {
      await route.fulfill({ json: { items: [{
        incident_id: 'opsinc_test', trigger_source: 'workflow_failure', run_id: '100', run_attempt: 1,
        session_id: '20260527T120000.000000Z-0001-0001', incident_type: 'failed_ingestion', status: 'open',
        persistence_status: 'd1_written', model_version: 'fallback-v1', detector_version: 'detectors-v1', confidence: 'low',
        confirmed_findings: ['Workflow result is failure.'], likely_causes: [], unknowns: [],
        recommended_next_actions: ['Inspect logs.'], unsafe_actions: [], evidence_refs: [],
        created_at: '2026-05-27T00:00:00Z', updated_at: '2026-05-27T00:00:00Z', resolved_at: null,
      }] } })
    })
    await page.route('**/api/diag/ops-incidents/analytics', async (route) => {
      await route.fulfill({ json: { total: 1, by_type: {}, by_status: {}, by_confidence: {}, open_high_confidence: 0 } })
    })
    await page.route('**/api/diag/ops-incidents/opsinc_test/remediation-proposals', async (route) => {
      await route.fulfill({ json: { items: [{
        proposal_id: 'opsprop_test', incident_id: 'opsinc_test', action_type: 'prepare_rollback_workflow',
        status: 'proposed', safety_level: 'blocked', title: 'Prepare rollback workflow',
        rationale: 'Rollback requires a known safe session.', command_preview: null,
        runbook_ref: 'docs/handbook/en/ops/d1-rollback.md', evidence_refs: [],
        required_checks: ['Confirm session status.'], blocked_reasons: ['Session id is missing.'],
        proposed_by: 'adr026-policy-v1', decided_by: null, decision_note: null,
        created_at: '2026-05-27T00:00:00Z', updated_at: '2026-05-27T00:00:00Z', decided_at: null,
      }] } })
    })
  })

  test('shows blocked proposal without execution controls', async ({ page }) => {
    await loginViaUi(page)
    await page.goto('/diag/ops-incidents')
    await page.getByText('opsinc_test').click()
    await expect(page.getByText('Prepare rollback workflow')).toBeVisible()
    await expect(page.getByText('Session id is missing.')).toBeVisible()
    await expect(page.getByRole('button', { name: /execute|rollback|rerun|apply/i })).toHaveCount(0)
  })
})
