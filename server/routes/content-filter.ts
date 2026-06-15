import { Hono } from "hono";
import type { Env } from "../env";
import type { JwtPayload } from "../services/jwt";
import { requireRole } from "../middleware/auth";
import {
  listRules,
  getRule,
  addRule,
  setEnabled,
  removeRule,
} from "../services/content-filter-service";

type CfEnv = { Bindings: Env; Variables: { user: JwtPayload } };

export const contentFilterRoutes = new Hono<CfEnv>();

// Hand-mirrored from apps/cli/ops/content_filter.py (the canonical source of
// truth). Pinned by server/__tests__/content-filter-modes-parity.test.ts — if
// these drift from the Python tuples, that test fails. Includes the regex /
// release_date pairs added by IMP-ADR040-03. Encoded "dimension:mode".
export const VALID_RULE_MODES = new Set([
  "actor:exclude",
  "tag:exclude",
  "tag:include",
  "gender:require_lead",
  "gender:exclude_all_male",
  "age:min_age",
  "age:max_age",
  "actor:regex_exclude",
  "actor:regex_include",
  "tag:regex_exclude",
  "tag:regex_include",
  "release_date:before",
  "release_date:after",
]);

export const VALUE_REQUIRED = new Set([
  "actor:exclude",
  "tag:exclude",
  "tag:include",
  "gender:require_lead",
  "age:min_age",
  "age:max_age",
  "actor:regex_exclude",
  "actor:regex_include",
  "tag:regex_exclude",
  "tag:regex_include",
  "release_date:before",
  "release_date:after",
]);

const errJson = (code: string, message: string) => ({ error: { code, message } });
const rowToRule = (r: { id: number; dimension: string; mode: string; value: string | null; enabled: number }) => ({
  id: r.id,
  dimension: r.dimension,
  mode: r.mode,
  value: r.value ?? "",
  enabled: r.enabled === 1,
});

// Strict YYYY-MM-DD parser mirroring the Python router's date.fromisoformat
// normalization (both backends store the canonical YYYY-MM-DD). Returns the
// normalized string or null when invalid (rejects 2020/01/01, 2020-13-01,
// 2020-02-30). Regex patterns are deliberately NOT compile-checked here:
// JS `new RegExp` and Python `re` dialects diverge (inline flags like `(?i)...`
// throw in JS but are valid Python), so a shared compile-check is impossible
// cross-backend; the Python ingestion engine fail-opens on a bad pattern.
function parseIsoDate(value: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const [, y, mo, d] = m;
  const dt = new Date(`${y}-${mo}-${d}T00:00:00Z`);
  if (
    Number.isNaN(dt.getTime()) ||
    dt.getUTCFullYear() !== Number(y) ||
    dt.getUTCMonth() + 1 !== Number(mo) ||
    dt.getUTCDate() !== Number(d)
  ) {
    return null;
  }
  return `${y}-${mo}-${d}`;
}

// GET / — list all rules (auth only; the read-side overlay needs this).
contentFilterRoutes.get("/", async (c) => {
  const rows = await listRules(c.env.REPORTS_DB);
  const items = rows.map(rowToRule);
  return c.json({ items, total: items.length });
});

// POST / — add a rule (admin only).
contentFilterRoutes.post("/", requireRole("admin"), async (c) => {
  let body: { dimension?: string; mode?: string; value?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json(errJson("content_filter.invalid_body", "Request body must be valid JSON"), 422);
  }
  const dimension = body.dimension ?? "";
  const mode = body.mode ?? "";
  let value = (body.value ?? "").trim();
  const key = `${dimension}:${mode}`;
  if (!VALID_RULE_MODES.has(key)) {
    return c.json(errJson("content_filter.invalid_mode", `${dimension} rules do not support mode '${mode}'`), 422);
  }
  if (VALUE_REQUIRED.has(key) && value.length === 0) {
    return c.json(errJson("content_filter.value_required", "this dimension/mode requires a non-empty value"), 422);
  }
  if (dimension === "release_date") {
    const normalized = parseIsoDate(value);
    if (normalized === null) {
      return c.json(errJson("content_filter.invalid_date", "release_date rules require value as an ISO date (YYYY-MM-DD)"), 422);
    }
    value = normalized;
  }
  const row = await addRule(c.env.REPORTS_DB, dimension, mode, value);
  return c.json(rowToRule(row), 201);
});

// PUT /:ruleId — toggle enabled (admin only).
contentFilterRoutes.put("/:ruleId", requireRole("admin"), async (c) => {
  const ruleId = Number(c.req.param("ruleId"));
  let body: { enabled?: boolean };
  try {
    body = await c.req.json();
  } catch {
    return c.json(errJson("content_filter.invalid_body", "Request body must be valid JSON"), 422);
  }
  if (typeof body.enabled !== "boolean") {
    return c.json(errJson("content_filter.invalid_enabled", "enabled must be a boolean"), 422);
  }
  const existing = await getRule(c.env.REPORTS_DB, ruleId);
  if (existing === null) {
    return c.json(errJson("content_filter.not_found", "Rule not found"), 404);
  }
  await setEnabled(c.env.REPORTS_DB, ruleId, body.enabled);
  return c.json(rowToRule((await getRule(c.env.REPORTS_DB, ruleId))!));
});

// DELETE /:ruleId — remove a rule (admin only).
contentFilterRoutes.delete("/:ruleId", requireRole("admin"), async (c) => {
  const deleted = await removeRule(c.env.REPORTS_DB, Number(c.req.param("ruleId")));
  return c.json({ deleted });
});
