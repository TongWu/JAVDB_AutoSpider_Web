import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";
import type { JwtPayload } from "../services/jwt";
import { requireRole } from "../middleware/auth";
import { loadConfigStore, saveConfigKeys } from "../services/config-store";
import {
  OPS_ALERT_POLICY_ID_HASH_LENGTH,
  OPS_ALERT_POLICY_ID_PREFIX,
  OPS_ALERT_POLICY_ID_SALT,
  prepareOpsAlertEventsListByIncident,
  prepareOpsAlertPoliciesList,
  prepareOpsAlertPolicyGetByIncidentType,
  prepareOpsAlertPolicyUpsert,
} from "../contract/sql-contract.gen";
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

function parseStringArray(value: string | null): string[] {
  return parseJsonArray(value).filter((item): item is string => typeof item === "string");
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

interface OpsAlertPolicyRow {
  policy_id: string
  incident_type: string
  min_confidence: string
  enabled: number | boolean
  channels_json: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

interface OpsAlertEventRow {
  alert_id: string
  incident_id: string
  policy_id: string | null
  status: string
  reason: string | null
  fired_at: string
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

function mapAlertPolicy(row: OpsAlertPolicyRow) {
  return {
    policy_id: row.policy_id,
    incident_type: row.incident_type,
    min_confidence: row.min_confidence,
    enabled: row.enabled === 1 || row.enabled === true,
    channels: parseStringArray(row.channels_json),
    updated_by: row.updated_by ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapAlertEvent(row: OpsAlertEventRow) {
  return {
    alert_id: row.alert_id,
    incident_id: row.incident_id,
    policy_id: row.policy_id ?? null,
    status: row.status,
    reason: row.reason ?? null,
    fired_at: row.fired_at,
  };
}

function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function buildAlertPolicyId(incidentType: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${OPS_ALERT_POLICY_ID_SALT}${incidentType}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `${OPS_ALERT_POLICY_ID_PREFIX}${toHex(digest).slice(0, OPS_ALERT_POLICY_ID_HASH_LENGTH)}`;
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

diagnosticsRoutes.get("/alert-policies", async (c) => {
  const rows = await prepareOpsAlertPoliciesList(c.env.REPORTS_DB, {}).all<OpsAlertPolicyRow>();
  return c.json({ items: rows.results.map(mapAlertPolicy) });
});

diagnosticsRoutes.put("/alert-policies/:incident_type", requireRole("admin"), async (c) => {
  const incidentType = c.req.param("incident_type");
  let parsedBody: unknown;
  try {
    parsedBody = await c.req.json();
  } catch {
    throw new HTTPException(422, { message: "Request body must be valid JSON" });
  }
  if (parsedBody === null || typeof parsedBody !== "object" || Array.isArray(parsedBody)) {
    throw new HTTPException(422, { message: "Request body must be a JSON object" });
  }
  const body = parsedBody as {
    min_confidence?: unknown
    enabled?: unknown
    channels?: unknown
  };
  const minConfidence = body.min_confidence ?? "medium";
  const enabled = body.enabled ?? true;
  const channels = body.channels ?? [];
  const allowedConfidence = ["low", "medium", "high"];

  if (typeof minConfidence !== "string" || !allowedConfidence.includes(minConfidence)) {
    throw new HTTPException(422, { message: `min_confidence must be one of: ${allowedConfidence.join(", ")}` });
  }
  if (typeof enabled !== "boolean") {
    throw new HTTPException(422, { message: "enabled must be a boolean" });
  }
  if (!Array.isArray(channels) || !channels.every((item) => typeof item === "string")) {
    throw new HTTPException(422, { message: "channels must be an array of strings" });
  }

  await prepareOpsAlertPolicyUpsert(c.env.REPORTS_DB, {
    policyId: await buildAlertPolicyId(incidentType),
    incidentType,
    minConfidence,
    enabled: enabled ? 1 : 0,
    channelsJson: JSON.stringify(channels),
    updatedBy: c.get("user").sub,
  }).run();

  const row = await prepareOpsAlertPolicyGetByIncidentType(c.env.REPORTS_DB, { incidentType }).first<OpsAlertPolicyRow>();
  if (!row) {
    throw new HTTPException(500, { message: "Failed to persist alert policy" });
  }
  return c.json(mapAlertPolicy(row));
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

interface OpsRemediationProposalRow {
  proposal_id: string
  incident_id: string
  action_type: string
  status: string
  safety_level: string
  title: string
  rationale: string
  command_preview: string | null
  runbook_ref: string | null
  evidence_refs_json: string
  required_checks_json: string
  blocked_reasons_json: string
  proposed_by: string
  decided_by: string | null
  decision_note: string | null
  created_at: string
  updated_at: string
  decided_at: string | null
}

function mapRemediationProposal(row: OpsRemediationProposalRow) {
  return {
    proposal_id: row.proposal_id,
    incident_id: row.incident_id,
    action_type: row.action_type,
    status: row.status,
    safety_level: row.safety_level,
    title: row.title,
    rationale: row.rationale,
    command_preview: row.command_preview ?? null,
    runbook_ref: row.runbook_ref ?? null,
    evidence_refs: parseJsonArray(row.evidence_refs_json),
    required_checks: parseJsonArray(row.required_checks_json),
    blocked_reasons: parseJsonArray(row.blocked_reasons_json),
    proposed_by: row.proposed_by,
    decided_by: row.decided_by ?? null,
    decision_note: row.decision_note ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    decided_at: row.decided_at ?? null,
  };
}

diagnosticsRoutes.get("/ops-incidents/:incident_id/remediation-proposals", async (c) => {
  const incidentId = c.req.param("incident_id");
  const rows = await c.env.REPORTS_DB
    .prepare("SELECT * FROM OpsRemediationProposals WHERE incident_id = ? ORDER BY created_at ASC")
    .bind(incidentId)
    .all<OpsRemediationProposalRow>();
  return c.json({ items: rows.results.map(mapRemediationProposal) });
});

diagnosticsRoutes.get("/ops-incidents/:incident_id/alert-events", async (c) => {
  const incidentId = c.req.param("incident_id");
  const rows = await prepareOpsAlertEventsListByIncident(c.env.REPORTS_DB, { incidentId }).all<OpsAlertEventRow>();
  return c.json({ items: rows.results.map(mapAlertEvent) });
});

diagnosticsRoutes.post("/remediation-proposals/:proposal_id/decision", requireRole("admin"), async (c) => {
  const proposalId = c.req.param("proposal_id");
  const body = await c.req.json<{ status: string; decision_note?: string | null }>();

  const allowedStatuses = ["approved", "rejected"];
  if (!allowedStatuses.includes(body.status)) {
    throw new HTTPException(422, { message: `status must be one of: ${allowedStatuses.join(", ")}` });
  }

  const decidedBy = c.get("user").sub;
  const now = new Date().toISOString();

  const existing = await c.env.REPORTS_DB
    .prepare("SELECT status, safety_level FROM OpsRemediationProposals WHERE proposal_id = ?")
    .bind(proposalId)
    .first<{ status: string; safety_level: string }>();
  if (!existing) {
    throw new HTTPException(404, { message: "Remediation proposal not found" });
  }
  // Decisions are single-transition (mirrors the Python API): a proposal may be
  // decided only while still 'proposed'. Re-deciding would overwrite the
  // actor/note/timestamp audit trail, so a duplicate/stale request gets 409.
  if (existing.status !== "proposed") {
    throw new HTTPException(409, {
      message: `Proposal already decided (${existing.status}); decisions are single-transition`,
    });
  }
  // A proposal the safety policy has blocked must never become 'approved'.
  // Rejecting a blocked proposal stays allowed.
  if (body.status === "approved" && existing.safety_level === "blocked") {
    throw new HTTPException(409, {
      message: "Cannot approve a proposal blocked by the safety policy",
    });
  }

  await c.env.REPORTS_DB
    .prepare(
      `UPDATE OpsRemediationProposals
          SET status = ?, decided_by = ?, decision_note = ?, decided_at = ?, updated_at = ?
        WHERE proposal_id = ? AND status = 'proposed'`,
    )
    .bind(body.status, decidedBy, body.decision_note ?? null, now, now, proposalId)
    .run();

  const row = await c.env.REPORTS_DB
    .prepare("SELECT * FROM OpsRemediationProposals WHERE proposal_id = ?")
    .bind(proposalId)
    .first<OpsRemediationProposalRow>();
  if (!row) throw new HTTPException(404, { message: "Remediation proposal not found" });
  return c.json(mapRemediationProposal(row));
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
    const key = `${row.page_type}\u0000${row.field}`;
    const bucket = historyByGroup.get(key);
    if (bucket) bucket.push(row.fill_rate);
    else historyByGroup.set(key, [row.fill_rate]);
  }
  for (const fill of fills) {
    const entry = PARSE_CONTRACT[fill.page_type]?.[fill.field];
    if (!entry || entry.severity !== "soft") continue;
    const history = historyByGroup.get(`${fill.page_type}\u0000${fill.field}`) ?? [];
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
