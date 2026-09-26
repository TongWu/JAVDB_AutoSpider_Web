import type { Env } from '../env'
import { resolveDispatchConfig } from './dispatch-config'
import { createGhClient } from './gh-client'
import { createJobRunsRepo } from './job-runs'

/** One resolution, one identity, evidence before external dispatch on every surface. */
export async function dispatchJob(
  env: Env,
  kind: string,
  workflow: string,
  inputs: Record<string, string>,
  ref = 'main',
) {
  const config = resolveDispatchConfig(env)
  const repo = createJobRunsRepo(env.OPERATIONS_DB, env, config)
  // Generic workflow inputs are arbitrary and may contain credentials.
  const job = await repo.create(kind, workflow, kind === 'workflow' ? undefined : inputs)
  try {
    await createGhClient(config).dispatchWorkflow(workflow, inputs, ref)
  } catch (error) {
    await repo.updateStatus(job.job_id, 'failed').catch(() => {})
    throw error
  }
  return job
}
