import type { Env } from '../env'

/** Dispatch bindings are authoritative; editable D1 config never overrides them. */
export function resolveDispatchConfig(env: Env) {
  return Object.freeze({
    tier: env.GH_ACTIONS_TIER ?? '',
    token: env.GH_ACTIONS_TOKEN ?? '',
    repo: env.GH_ACTIONS_REPO ?? '',
  })
}
export type DispatchConfig = ReturnType<typeof resolveDispatchConfig>
export function isDispatchConfigured(config: DispatchConfig): boolean {
  return ['monitor', 'edit', 'admin'].includes(config.tier) && !!config.token && !!config.repo
}
