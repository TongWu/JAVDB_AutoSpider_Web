/**
 * Parse-field health — ADR-035 Phase 3 "drift surface".
 *
 * TypeScript mirror of the Python site-contract drift surface so this Worker
 * backend and the Python (`apps/api`) backend serve the same `openapi.json`
 * contract (ADR-034 dual-backend parity):
 *
 *   - javdb/spider/parse_contract.py  → PARSE_CONTRACT (field / severity / threshold table)
 *   - javdb/ops/sentinel/health.py    → compute_field_health()
 *
 * The data layer (`ParseRunFieldFillRepo.latest_committed_fills()`) lives in the
 * route (server/routes/diagnostics.ts) as a thin D1 query, mirroring the Python
 * repo split.
 *
 * RECONCILE: the `index` field set, the `soft` baseline_rel (0.5) and the
 * sentinel defaults below are authoritative per ADR-035 Phase 3. The per-field
 * critical `min_fill` floors and the `detail` field set must be kept verbatim in
 * sync with javdb/spider/parse_contract.py (JAVDB_AutoSpider_CICD, PR #181) when
 * the contract is re-vendored.
 */

export type Severity = "critical" | "soft";

export type FieldHealthStatus =
  | "ok"
  | "critical_drift"
  | "soft_drift"
  | "no_baseline"
  | "insufficient_sample";

export interface FieldContract {
  severity: Severity;
  /** Critical fields: hard floor. fill_rate < min_fill ⇒ critical_drift. */
  min_fill?: number;
  /** Soft fields: threshold = baseline_rel * baseline. fill_rate below ⇒ soft_drift. */
  baseline_rel?: number;
}

/** page_type → field → contract entry. */
export type ParseContract = Record<string, Record<string, FieldContract>>;

// ---------------------------------------------------------------------------
// PARSE_CONTRACT — verbatim mirror of javdb/spider/parse_contract.py.
// ---------------------------------------------------------------------------
export const PARSE_CONTRACT: ParseContract = {
  index: {
    href: { severity: "critical", min_fill: 0.99 },
    video_code: { severity: "critical", min_fill: 0.99 },
    title: { severity: "critical", min_fill: 0.95 },
    rate: { severity: "soft", baseline_rel: 0.5 },
    comment_count: { severity: "soft", baseline_rel: 0.5 },
    release_date: { severity: "soft", baseline_rel: 0.5 },
  },
  detail: {
    video_code: { severity: "critical", min_fill: 0.99 },
    title: { severity: "critical", min_fill: 0.95 },
    release_date: { severity: "soft", baseline_rel: 0.5 },
    duration: { severity: "soft", baseline_rel: 0.5 },
    maker: { severity: "soft", baseline_rel: 0.5 },
    actors: { severity: "soft", baseline_rel: 0.5 },
  },
};

/** Minimum sample count below which a field's drift is not assessed. */
export const SENTINEL_MIN_SAMPLE = 30;
/** Number of recent committed observations used to compute the soft baseline. */
export const SENTINEL_BASELINE_WINDOW = 14;

/** A latest-committed fill observation (one row from latest_committed_fills()). */
export interface FieldFill {
  page_type: string;
  field: string;
  fill_rate: number;
  sample_count: number;
  observed_at: string;
}

/** One annotated health row — matches the openapi `FieldHealth` schema. */
export interface FieldHealthItem {
  page_type: string;
  field: string;
  severity: Severity;
  fill_rate: number;
  sample_count: number;
  observed_at: string;
  baseline: number | null;
  threshold: number | null;
  status: FieldHealthStatus;
}

export interface ComputeFieldHealthOptions {
  /** Defaults to PARSE_CONTRACT. */
  contract?: ParseContract;
  /** Defaults to SENTINEL_MIN_SAMPLE. */
  minSample?: number;
  /** page_type → field → baseline (median of recent committed fills, soft fields). */
  baselines?: Record<string, Record<string, number | null>>;
}

/** Median of a list of numbers; `null` for an empty list. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Annotate latest-committed fills with drift health — mirror of Python's
 * compute_field_health(). Rows whose (page_type, field) is not in the
 * PARSE_CONTRACT are skipped (only contracted fields are health-tracked).
 *
 * Status precedence (highest first):
 *   1. insufficient_sample — sample_count < minSample (can't assess drift)
 *   2. critical_drift / ok — critical field vs its min_fill floor
 *   3. no_baseline         — soft field with no historical baseline
 *   4. soft_drift / ok     — soft field vs baseline_rel * baseline
 */
export function computeFieldHealth(
  fills: FieldFill[],
  options: ComputeFieldHealthOptions = {},
): FieldHealthItem[] {
  const contract = options.contract ?? PARSE_CONTRACT;
  const minSample = options.minSample ?? SENTINEL_MIN_SAMPLE;
  const baselines = options.baselines ?? {};

  const items: FieldHealthItem[] = [];
  for (const fill of fills) {
    const entry = contract[fill.page_type]?.[fill.field];
    if (!entry) continue;

    const isCritical = entry.severity === "critical";
    // Baseline is a soft-field concept; critical fields use the static min_fill.
    const baseline = isCritical ? null : baselines[fill.page_type]?.[fill.field] ?? null;

    let threshold: number | null = null;
    if (isCritical) {
      threshold = entry.min_fill ?? null;
    } else if (baseline !== null) {
      threshold = (entry.baseline_rel ?? 0) * baseline;
    }

    let status: FieldHealthStatus;
    if (fill.sample_count < minSample) {
      status = "insufficient_sample";
    } else if (isCritical) {
      status = threshold !== null && fill.fill_rate < threshold ? "critical_drift" : "ok";
    } else if (baseline === null) {
      status = "no_baseline";
    } else {
      status = threshold !== null && fill.fill_rate < threshold ? "soft_drift" : "ok";
    }

    items.push({
      page_type: fill.page_type,
      field: fill.field,
      severity: entry.severity,
      fill_rate: fill.fill_rate,
      sample_count: fill.sample_count,
      observed_at: fill.observed_at,
      baseline,
      threshold,
      status,
    });
  }
  return items;
}
