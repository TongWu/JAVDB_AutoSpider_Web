/** ADR-061. Separate from editable-config masking; only reviewed scalar values survive. */
import type { Env } from '../env'
import { resolveDispatchConfig, type DispatchConfig } from './dispatch-config'
import { CONFIG_META_FIELDS } from './config-schema'
import { loadConfigStore, mergeWithDefaults } from './config-store'

export type Consumer = 'api_process' | 'cli_accessor' | 'launched_job'
export type Source =
  | 'default'
  | 'config_module'
  | 'override_store'
  | 'derived'
  | 'launch_options'
  | 'environment'
  | 'unknown'
export interface Field {
  key: string
  source: Source
  sensitive: boolean
  present: boolean
  value?: string | number | boolean
}
export interface Snapshot {
  schema_version: 1
  consumer: Consumer
  captured_at: string
  scope: string
  unobservable: string[]
  fields: Field[]
}
export type Reason =
  | 'not_observed_in_this_process'
  | 'capture_failed'
  | 'writes_forbidden'
  | 'observation_failed'
  | 'no_retained_evidence'
  | 'storage_unavailable'
  | 'invalid_evidence'
export type ConsumerEvidence = { consumer: Consumer } & (
  | { status: 'observed' | 'captured'; reason: null; snapshot: Snapshot; digest: string }
  | { status: 'unobservable'; reason: 'not_observed_in_this_process'; snapshot: null; digest: null }
  | {
      status: 'snapshot_unavailable'
      reason: Exclude<Reason, 'not_observed_in_this_process'>
      snapshot: null
      digest: null
    }
)
export interface Envelope {
  schema_version: 1
  job_id?: string
  consumers: ConsumerEvidence[]
}
const consumers: Consumer[] = ['api_process', 'cli_accessor', 'launched_job']
const sources = new Set([
  'default',
  'config_module',
  'override_store',
  'derived',
  'launch_options',
  'environment',
  'unknown',
])
const integers = new Set(
  `PAGE_START PAGE_END START_PAGE END_PAGE PAGE_SCAN_MAX PAGE_SCAN_STOP_AFTER REQUEST_TIMEOUT LOGIN_ATTEMPTS_PER_PROXY_LIMIT LOGIN_MAX_FAILURES_BEFORE_PROXY_SWITCH MAX_MOVIES_PHASE1 MAX_MOVIES_PHASE2 PHASE2_MIN_COMMENTS MIN_FILE_SIZE_MB DELAY_BETWEEN_ADDITIONS ALWAYS_BYPASS_TIME`.split(
    ' ',
  ),
)
const booleans = new Set(
  `DRY_RUN PAGE_SCAN_DYNAMIC AUTO_START SKIP_CHECKING QB_VERIFY_TLS QB_ALLOW_INSECURE_HTTP IGNORE_HISTORY USE_HISTORY IGNORE_RELEASE_DATE USE_PROXY NO_PROXY NO_RCLONE_FILTER DISABLE_ALL_FILTERS ENABLE_DEDUP ENABLE_REDOWNLOAD PARSE_ALL ALL FROM_PIPELINE SEQUENTIAL PIKPAK_INDIVIDUAL`.split(
    ' ',
  ),
)
const enums: Record<string, string[]> = {
  STORAGE_BACKEND: ['sqlite', 'd1', 'dual'],
  STORAGE_MODE: ['db', 'csv', 'duo'],
  PROXY_MODE: ['single', 'pool'],
  LOG_LEVEL: ['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'],
  PHASE: ['1', '2', 'all'],
  MODE: ['daily', 'adhoc'],
}
const scopes: Record<Consumer, string> = {
  api_process: 'resolver_at_start',
  cli_accessor: 'observed_cfg_calls_only',
  launched_job: 'resolved_launch_options_only',
}
const retentionSeconds = 90 * 86400
export const validJobId = (id: string): boolean => /^[a-zA-Z0-9_-]{1,64}$/.test(id)

export function redactField(key: string, value: unknown, source: string, sensitive = false): Field {
  if (!/^[A-Z][A-Z0-9_]{0,79}$/.test(key)) key = 'UNKNOWN_FIELD'
  const safe =
    !sensitive &&
    !/PASSWORD|SECRET|TOKEN|COOKIE|CREDENTIAL|API_KEY|USERNAME|PRIVATE_KEY/.test(key) &&
    ((integers.has(key) && typeof value === 'number' && Number.isSafeInteger(value)) ||
      (booleans.has(key) && typeof value === 'boolean') ||
      (typeof value === 'string' && enums[key]?.includes(value)))
  const present =
    value !== null &&
    value !== undefined &&
    value !== '' &&
    !(typeof value === 'object' && Object.keys(value).length === 0)
  return {
    key,
    source: sources.has(source) ? (source as Source) : 'unknown',
    sensitive: !safe,
    present,
    ...(safe ? { value: value as string | number | boolean } : {}),
  }
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']'
  if (value !== null && typeof value === 'object') {
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map(
          (key) =>
            JSON.stringify(key) + ':' + canonicalJson((value as Record<string, unknown>)[key]),
        )
        .join(',') +
      '}'
    )
  }
  return JSON.stringify(value)
}

export function buildSnapshot(
  consumer: Consumer,
  fields: Field[],
  stamp = new Date().toISOString(),
): Snapshot {
  const clean = fields.map((f) => ({
    ...redactField(f.key, f.value, f.source, f.sensitive),
    present: !!f.present,
  }))
  clean.sort((a, b) =>
    canonicalJson(a) < canonicalJson(b) ? -1 : canonicalJson(a) > canonicalJson(b) ? 1 : 0,
  )
  return {
    schema_version: 1,
    consumer,
    captured_at: new Date(stamp).toISOString(),
    scope: scopes[consumer],
    unobservable: ['direct_imports', 'later_dynamic_reads', 'external_consumers'],
    fields: clean,
  }
}

export async function digestSnapshot(snapshot: Snapshot): Promise<string> {
  const buffer = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(canonicalJson(snapshot)),
  )
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('')
}

function empty(
  consumer: Consumer,
  status: 'unobservable' | 'snapshot_unavailable',
  reason: Reason,
): ConsumerEvidence {
  if (status === 'unobservable')
    return {
      consumer,
      status,
      reason: 'not_observed_in_this_process',
      snapshot: null,
      digest: null,
    }
  return {
    consumer,
    status,
    reason: reason === 'not_observed_in_this_process' ? 'invalid_evidence' : reason,
    snapshot: null,
    digest: null,
  }
}

async function observeApi(
  env: Env,
  config: DispatchConfig = resolveDispatchConfig(env),
): Promise<ConsumerEvidence> {
  const store = await loadConfigStore(env.OPERATIONS_DB, env.SECRETS_ENCRYPTION_KEY)
  const values = mergeWithDefaults(store)
  // Only schema keys are observed. Arbitrary DB keys must not become metadata.
  const bindings: Record<string, string> = {
    GH_ACTIONS_TIER: config.tier,
    GH_ACTIONS_TOKEN: config.token,
    GH_ACTIONS_REPO: config.repo,
  }
  const fields = CONFIG_META_FIELDS.filter((f) => !(f.key in bindings)).map((f) =>
    redactField(f.key, values[f.key], f.key in store ? 'override_store' : 'default', f.sensitive),
  )
  fields.push(
    ...Object.entries(bindings).map(([key, value]) => redactField(key, value, 'environment', true)),
  )
  const snapshot = buildSnapshot('api_process', fields)
  return {
    consumer: 'api_process',
    status: 'observed',
    reason: null,
    snapshot,
    digest: await digestSnapshot(snapshot),
  }
}

export async function currentConsumers(env: Env): Promise<Envelope> {
  let api: ConsumerEvidence
  try {
    api = await observeApi(env)
  } catch {
    api = empty('api_process', 'snapshot_unavailable', 'observation_failed')
  }
  return {
    schema_version: 1,
    consumers: [
      api,
      empty('cli_accessor', 'unobservable', 'not_observed_in_this_process'),
      empty('launched_job', 'unobservable', 'not_observed_in_this_process'),
    ],
  }
}

interface Row {
  consumer: string
  status: string
  reason: unknown
  snapshot_json: string | null
  digest: string | null
}
async function decode(row: Row): Promise<ConsumerEvidence> {
  if (!consumers.includes(row.consumer as Consumer)) throw new Error('Invalid evidence consumer')
  const consumer = row.consumer as Consumer
  try {
    if (
      row.status === 'unobservable' &&
      row.reason === 'not_observed_in_this_process' &&
      row.snapshot_json === null &&
      row.digest === null
    ) {
      return empty(consumer, 'unobservable', 'not_observed_in_this_process')
    }
    if (row.status !== 'captured' || row.reason !== null || !row.snapshot_json)
      throw new Error('Invalid evidence state')
    const raw = JSON.parse(row.snapshot_json) as Snapshot
    const snapshot = buildSnapshot(consumer, raw.fields, raw.captured_at)
    if (
      canonicalJson(raw) !== canonicalJson(snapshot) ||
      row.digest !== (await digestSnapshot(snapshot))
    )
      throw new Error('Invalid evidence payload')
    return { consumer, status: 'captured', reason: null, snapshot, digest: row.digest }
  } catch {
    return empty(consumer, 'snapshot_unavailable', 'invalid_evidence')
  }
}

export async function insertSnapshot(
  db: D1Database,
  jobId: string,
  input: Snapshot,
): Promise<ConsumerEvidence> {
  const snapshot = buildSnapshot(input.consumer, input.fields, input.captured_at)
  const result = await db
    .prepare(
      `INSERT INTO ConfigSnapshots (job_id,consumer,captured_at,expires_at,status,reason,snapshot_json,digest)
    VALUES (?,?,?,?,'captured',NULL,?,?) ON CONFLICT(job_id,consumer) DO NOTHING`,
    )
    .bind(
      jobId,
      snapshot.consumer,
      snapshot.captured_at,
      Math.floor(Date.parse(snapshot.captured_at) / 1000) + retentionSeconds,
      canonicalJson(snapshot),
      await digestSnapshot(snapshot),
    )
    .run()
  if (!result.success) throw new Error('Snapshot write not acknowledged')
  const row = await db
    .prepare(
      'SELECT consumer,status,reason,snapshot_json,digest FROM ConfigSnapshots WHERE job_id = ? AND consumer = ?',
    )
    .bind(jobId, snapshot.consumer)
    .first<Row>()
  if (!row) throw new Error('Snapshot acknowledgement missing')
  return decode(row)
}

export async function captureDispatch(
  env: Env,
  jobId: string,
  config: DispatchConfig = resolveDispatchConfig(env),
): Promise<Envelope> {
  try {
    if (!validJobId(jobId)) throw new Error('Invalid job ID')
    const api = await observeApi(env, config)
    if (!api.snapshot) throw new Error('Observation missing')
    await insertSnapshot(env.OPERATIONS_DB, jobId, api.snapshot)
    for (const consumer of ['cli_accessor', 'launched_job'] as Consumer[]) {
      const result = await env.OPERATIONS_DB.prepare(
        `INSERT INTO ConfigSnapshots (job_id,consumer,captured_at,expires_at,status,reason,snapshot_json,digest)
        VALUES (?,?,?,?,'unobservable','not_observed_in_this_process',NULL,NULL) ON CONFLICT(job_id,consumer) DO NOTHING`,
      )
        .bind(
          jobId,
          consumer,
          api.snapshot.captured_at,
          Math.floor(Date.parse(api.snapshot.captured_at) / 1000) + retentionSeconds,
        )
        .run()
      if (!result.success) throw new Error('Snapshot write not acknowledged')
    }
    const retained = await readJobSnapshots(env.OPERATIONS_DB, jobId)
    if (retained.consumers.some((c) => c.status === 'snapshot_unavailable')) {
      throw new Error('Snapshot acknowledgement unavailable')
    }
    return retained
  } catch {
    // Never log thrown errors: provider error messages can include credentials.
    try {
      console.error('config_snapshot snapshot_unavailable')
    } catch {
      /* launch continues */
    }
    return {
      schema_version: 1,
      job_id: jobId,
      consumers: consumers.map((c) => empty(c, 'snapshot_unavailable', 'capture_failed')),
    }
  }
}

export async function readJobSnapshots(
  db: D1Database,
  jobId: string,
  now = Math.floor(Date.now() / 1000),
): Promise<Envelope> {
  try {
    const result = await db
      .prepare(
        'SELECT consumer,status,reason,snapshot_json,digest FROM ConfigSnapshots WHERE job_id = ? AND expires_at > ? ORDER BY consumer',
      )
      .bind(jobId, now)
      .all<Row>()
    if (!result.success) throw new Error('Snapshot read failed')
    const decoded = await Promise.all(result.results.map(decode))
    const found = new Map(decoded.map((row) => [row.consumer, row]))
    return {
      schema_version: 1,
      job_id: jobId,
      consumers: consumers.map(
        (c) => found.get(c) ?? empty(c, 'snapshot_unavailable', 'no_retained_evidence'),
      ),
    }
  } catch {
    return {
      schema_version: 1,
      job_id: jobId,
      consumers: consumers.map((c) => empty(c, 'snapshot_unavailable', 'storage_unavailable')),
    }
  }
}

export async function cleanupSnapshots(
  db: D1Database,
  now = Math.floor(Date.now() / 1000),
): Promise<void> {
  const result = await db
    .prepare('DELETE FROM ConfigSnapshots WHERE expires_at <= ?')
    .bind(now)
    .run()
  if (!result.success) throw new Error('Snapshot cleanup failed')
}
