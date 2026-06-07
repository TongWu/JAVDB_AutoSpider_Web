import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";
import type { JwtPayload } from "../services/jwt";
import { requireRole } from "../middleware/auth";
import { loadConfigStore, saveConfigKeys } from "../services/config-store";
import {
  PARSE_CONTRACT,
  SENTINEL_BASELINE_WINDOW,
  computeFieldHealth,
  median,
  type FieldFill,
} from "../services/parse-field-health";

type DiagEnv = { Bindings: Env; Variables: { user: JwtPayload } };

export const diagnosticsRoutes = new Hono<DiagEnv>();

function cookiePreview(cookie: string): string {
  return cookie.length > 8 ? cookie.slice(0, 8) + "..." : cookie;
}

function isRefreshRecent(lastRefreshTime: string | null, maxAgeHours = 24): boolean {
  if (!lastRefreshTime) return false;
  try {
    const dt = new Date(lastRefreshTime);
    const age = Date.now() - dt.getTime();
    return age >= 0 && age < maxAgeHours * 3600 * 1000;
  } catch {
    return false;
  }
}

diagnosticsRoutes.get("/javdb-session", async (c) => {
  const config = await loadConfigStore(c.env.OPERATIONS_DB, c.env.SECRETS_ENCRYPTION_KEY);
  const cookie = String(config.JAVDB_SESSION_COOKIE ?? "");

  const row = await c.env.OPERATIONS_DB
    .prepare("SELECT value FROM system_state WHERE key = ?")
    .bind("last_javdb_refresh")
    .first<{ value: string }>();
  const lastRefresh = row?.value ?? null;

  return c.json({
    cookie_present: !!cookie,
    cookie_value_preview: cookie ? cookiePreview(cookie) : null,
    last_refresh_time: lastRefresh,
    estimated_expiry: null,
    is_likely_valid: !!cookie && isRefreshRecent(lastRefresh),
  });
});

function parseJsonArray(value: string | null): unknown[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

interface OpsIncidentRow {
  incident_id: string
  trigger_source: string
  run_id: string | null
  run_attempt: number | null
  session_id: string | null
  incident_type: string
  status: string
  persistence_status: string
  model_version: string
  detector_version: string
  confidence: string
  confirmed_findings_json: string | null
  likely_causes_json: string | null
  unknowns_json: string | null
  recommended_next_actions_json: string | null
  unsafe_actions_json: string | null
  evidence_refs_json: string | null
  created_at: string
  updated_at: string
  resolved_at: string | null
}

// bundle_schema_version is storage-internal and intentionally excluded from the API surface (matches Python OpsIncidentSchema).
function mapOpsIncident(row: OpsIncidentRow) {
  return {
    incident_id: row.incident_id,
    trigger_source: row.trigger_source,
    run_id: row.run_id ?? null,
    run_attempt: row.run_attempt ?? null,
    session_id: row.session_id ?? null,
    incident_type: row.incident_type,
    status: row.status,
    persistence_status: row.persistence_status,
    model_version: row.model_version,
    detector_version: row.detector_version,
    confidence: row.confidence,
    confirmed_findings: parseJsonArray(row.confirmed_findings_json),
    likely_causes: parseJsonArray(row.likely_causes_json),
    unknowns: parseJsonArray(row.unknowns_json),
    recommended_next_actions: parseJsonArray(row.recommended_next_actions_json),
    unsafe_actions: parseJsonArray(row.unsafe_actions_json),
    evidence_refs: parseJsonArray(row.evidence_refs_json),
    created_at: row.created_at,
    updated_at: row.updated_at,
    resolved_at: row.resolved_at ?? null,
  };
}

diagnosticsRoutes.get("/ops-incidents", async (c) => {
  const status = c.req.query("status");
  const incidentType = c.req.query("incident_type");
  const confidence = c.req.query("confidence");
  const runId = c.req.query("run_id");
  const sessionId = c.req.query("session_id");
  const rawLimit = c.req.query("limit");
  let limit = 50;
  if (rawLimit !== undefined) {
    const parsed = Number.parseInt(rawLimit, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new HTTPException(400, { message: "limit must be a positive integer" });
    }
    limit = Math.min(100, parsed);
  }
  const clauses: string[] = [];
  const bindings: (string | number)[] = [];
  if (status) {
    clauses.push("status = ?");
    bindings.push(status);
  }
  if (incidentType) {
    clauses.push("incident_type = ?");
    bindings.push(incidentType);
  }
  if (confidence) {
    clauses.push("confidence = ?");
    bindings.push(confidence);
  }
  if (runId) {
    clauses.push("run_id = ?");
    bindings.push(runId);
  }
  if (sessionId) {
    clauses.push("session_id = ?");
    bindings.push(sessionId);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = await c.env.REPORTS_DB
    .prepare(`SELECT * FROM OpsIncidents ${where} ORDER BY created_at DESC LIMIT ?`)
    .bind(...bindings, limit)
    .all<OpsIncidentRow>();
  return c.json({ items: rows.results.map(mapOpsIncident) });
});

diagnosticsRoutes.get("/ops-incidents/analytics", async (c) => {
  const rows = await c.env.REPORTS_DB.prepare("SELECT incident_type, status, confidence FROM OpsIncidents ORDER BY created_at DESC LIMIT 500").all<Pick<OpsIncidentRow, "incident_type" | "status" | "confidence">>();
  const byType: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const byConfidence: Record<string, number> = {};
  for (const row of rows.results) {
    byType[row.incident_type] = (byType[row.incident_type] ?? 0) + 1;
    byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
    byConfidence[row.confidence] = (byConfidence[row.confidence] ?? 0) + 1;
  }
  return c.json({
    total: rows.results.length,
    by_type: byType,
    by_status: byStatus,
    by_confidence: byConfidence,
    open_high_confidence: rows.results.filter((row) => row.status === "open" && row.confidence === "high").length,
  });
});

diagnosticsRoutes.get("/ops-incidents/:incident_id", async (c) => {
  const incidentId = c.req.param("incident_id");
  const row = await c.env.REPORTS_DB
    .prepare("SELECT * FROM OpsIncidents WHERE incident_id = ?")
    .bind(incidentId)
    .first<OpsIncidentRow>();
  if (!row) throw new HTTPException(404, { message: "Incident not found" });
  return c.json(mapOpsIncident(row));
});

// GET /parse-field-health — site-contract drift surface (ADR-035 Phase 3).
// Read-only: newest committed fill per (page_type, field), annotated against the
// PARSE_CONTRACT. Mirrors Python ParseRunFieldFillRepo.latest_committed_fills()
// + compute_field_health().
interface RankedFillRow {
  page_type: string;
  field: string;
  fill_rate: number;
}

diagnosticsRoutes.get("/parse-field-health", async (c) => {
  const db = c.env.REPORTS_DB;

  // Newest committed fill per (page_type, field) — correlated subquery on
  // MAX(observed_at) over committed rows (ParseRunFieldFillRepo.latest_committed_fills).
  let fills: FieldFill[];
  try {
    const res = await db
      .prepare(
        `SELECT page_type, field, fill_rate, sample_count, observed_at
           FROM ParseRunFieldFill p
          WHERE committed = 1
            AND observed_at = (
              SELECT MAX(observed_at) FROM ParseRunFieldFill q
               WHERE q.page_type = p.page_type AND q.field = p.field AND q.committed = 1
            )
          ORDER BY page_type, field`,
      )
      .all<FieldFill>();
    fills = res.results;
  } catch (err) {
    // ParseRunFieldFill is created by the parse pipeline; on a fresh deployment
    // the table is simply absent — treat ONLY that as an empty surface. Let
    // transient D1 / binding / schema errors propagate (→ 500) so a backend
    // outage isn't masked as "no drift observed".
    if (err instanceof Error && /no such table/i.test(err.message)) {
      return c.json({ items: [] });
    }
    throw err;
  }

  if (fills.length === 0) {
    return c.json({ items: [] });
  }

  // Baseline (soft fields): median of recent committed fill_rates BEFORE the
  // latest observation (rn >= 2), per (page_type, field), over the sentinel
  // window. A field with no prior committed history ⇒ no baseline ⇒ no_baseline.
  const baselines: Record<string, Record<string, number | null>> = {};
  const historyByGroup = new Map<string, number[]>();
  const ranked = await db
    .prepare(
      `WITH ranked AS (
         SELECT page_type, field, fill_rate,
                ROW_NUMBER() OVER (PARTITION BY page_type, field ORDER BY observed_at DESC) AS rn
           FROM ParseRunFieldFill
          WHERE committed = 1
       )
       SELECT page_type, field, fill_rate FROM ranked WHERE rn BETWEEN 2 AND ?`,
    )
    .bind(SENTINEL_BASELINE_WINDOW + 1)
    .all<RankedFillRow>();
  for (const row of ranked.results) {
    const key = `${row.page_type} ${row.field}`;
    const bucket = historyByGroup.get(key);
    if (bucket) bucket.push(row.fill_rate);
    else historyByGroup.set(key, [row.fill_rate]);
  }
  for (const fill of fills) {
    const entry = PARSE_CONTRACT[fill.page_type]?.[fill.field];
    if (!entry || entry.severity !== "soft") continue;
    const history = historyByGroup.get(`${fill.page_type} ${fill.field}`) ?? [];
    (baselines[fill.page_type] ??= {})[fill.field] = median(history);
  }

  return c.json({ items: computeFieldHealth(fills, { baselines }) });
});

diagnosticsRoutes.post("/javdb-session/refresh", requireRole("admin"), async (c) => {
  const body = await c.req.json<{ method: string; cookie_value?: string | null }>();

  if (body.method === "cookie_paste") {
    const cookieValue = (body.cookie_value ?? "").trim();
    if (!cookieValue) {
      throw new HTTPException(422, { message: "cookie_value is required when method='cookie_paste'" });
    }

    await saveConfigKeys(c.env.OPERATIONS_DB, { JAVDB_SESSION_COOKIE: cookieValue }, c.env.SECRETS_ENCRYPTION_KEY);

    try {
      await c.env.OPERATIONS_DB
        .prepare(
          `INSERT INTO system_state (key, value, updated_at) VALUES ('last_javdb_refresh', ?, datetime('now'))
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
        )
        .bind(new Date().toISOString())
        .run();
    } catch {
      // best-effort timestamp write
    }

    return c.json({
      success: true,
      method: "cookie_paste",
      new_cookie_preview: cookiePreview(cookieValue),
    });
  }

  if (body.method === "headless") {
    return c.json({
      success: false,
      method: "headless",
      error: "Headless login unavailable in Cloudflare mode. Use cookie_paste or dispatch via GH Actions.",
    });
  }

  throw new HTTPException(422, { message: `Unknown method: '${body.method}'. Must be 'headless' or 'cookie_paste'.` });
});
