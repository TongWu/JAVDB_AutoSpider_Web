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

const GENDER_VALUES = new Set(["female", "male"]);
const MAX_REGEX_LEN = 200;
// Heuristic ReDoS guard mirroring the Python regex_write_risk: a quantified group
// whose body contains an unbounded quantifier (e.g. (a+)+, (a*)*, (.*)+). Rejected
// at the write boundary because the Python ingestion matcher has no timeout.
const NESTED_QUANTIFIER_RE = /\([^()]*[*+][^()]*\)[*+]/;

// Validate + normalize a rule value, mirroring the Python `validate_rule_value`
// (apps/cli/ops/content_filter.py) so both backends accept/reject the same
// gender/age/release_date/ReDoS inputs. Regex *compile* is NOT checked here
// (JS/Python dialect). Returns the normalized value, or a {code,message} for 422.
function validateRuleValue(
  dimension: string,
  mode: string,
  value: string,
): { value: string } | { error: { code: string; message: string } } {
  if (dimension === "gender" && mode === "require_lead") {
    const normalized = value.toLowerCase();
    if (!GENDER_VALUES.has(normalized)) {
      return { error: { code: "content_filter.invalid_value", message: "gender require_lead rules require a value of female or male" } };
    }
    return { value: normalized };
  }
  if (dimension === "gender" && mode === "exclude_all_male") {
    if (value.length > 0) {
      return { error: { code: "content_filter.invalid_value", message: "gender exclude_all_male rules do not accept a value" } };
    }
    return { value: "" };
  }
  if (dimension === "age") {
    if (!/^\d+$/.test(value)) {
      return { error: { code: "content_filter.invalid_value", message: "age rules require a non-negative integer value" } };
    }
    return { value: String(Number(value)) };
  }
  if (dimension === "release_date") {
    const normalized = parseIsoDate(value);
    if (normalized === null) {
      return { error: { code: "content_filter.invalid_date", message: "release_date rules require value as an ISO date (YYYY-MM-DD)" } };
    }
    return { value: normalized };
  }
  if (mode === "regex_exclude" || mode === "regex_include") {
    if (value.length > MAX_REGEX_LEN) {
      return { error: { code: "content_filter.invalid_value", message: `regex pattern too long (max ${MAX_REGEX_LEN} characters)` } };
    }
    if (NESTED_QUANTIFIER_RE.test(value)) {
      return { error: { code: "content_filter.invalid_value", message: "regex pattern has nested quantifiers (catastrophic-backtracking risk); rewrite it" } };
    }
    return { value };
  }
  return { value };
}

// GET / — list all rules (auth only; the read-side overlay needs this).
contentFilterRoutes.get("/", async (c) => {
  const rows = await listRules(c.env.REPORTS_DB);
  const items = rows.map(rowToRule);
  return c.json({ items, total: items.length });
});

// POST / — add a rule (admin only).
contentFilterRoutes.post("/", requireRole("admin"), async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(errJson("content_filter.invalid_body", "Request body must be valid JSON"), 422);
  }
  // A JSON `null` (or array/primitive) parses fine; guard before field access so
  // it returns 422 like the Python schema, never a 500 from dereferencing null.
  if (body === null || typeof body !== "object") {
    return c.json(errJson("content_filter.invalid_body", "Request body must be a JSON object"), 422);
  }
  const b = body as { dimension?: unknown; mode?: unknown; value?: unknown };
  const dimension = typeof b.dimension === "string" ? b.dimension : "";
  const mode = typeof b.mode === "string" ? b.mode : "";
  // Guard the value type before calling .trim() — mirrors the watchlist route's
  // string-field guard and the Python `value: str` schema (a non-string `value`
  // is 422 on both backends, never a 500). An omitted value defaults to "".
  let value = "";
  if (b.value !== undefined) {
    if (typeof b.value !== "string") {
      return c.json(errJson("content_filter.invalid_value", "value must be a string"), 422);
    }
    value = b.value.trim();
  }
  const key = `${dimension}:${mode}`;
  if (!VALID_RULE_MODES.has(key)) {
    return c.json(errJson("content_filter.invalid_mode", `${dimension} rules do not support mode '${mode}'`), 422);
  }
  if (VALUE_REQUIRED.has(key) && value.length === 0) {
    return c.json(errJson("content_filter.value_required", "this dimension/mode requires a non-empty value"), 422);
  }
  const validated = validateRuleValue(dimension, mode, value);
  if ("error" in validated) {
    return c.json(errJson(validated.error.code, validated.error.message), 422);
  }
  value = validated.value;
  const row = await addRule(c.env.REPORTS_DB, dimension, mode, value);
  return c.json(rowToRule(row), 201);
});

// PUT /:ruleId — toggle enabled (admin only).
contentFilterRoutes.put("/:ruleId", requireRole("admin"), async (c) => {
  const ruleId = Number(c.req.param("ruleId"));
  // The Python path param is typed `int`; reject a non-integer id with 422
  // instead of binding NaN into the D1 query.
  if (!Number.isInteger(ruleId)) {
    return c.json(errJson("content_filter.invalid_id", "rule id must be an integer"), 422);
  }
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(errJson("content_filter.invalid_body", "Request body must be valid JSON"), 422);
  }
  if (body === null || typeof body !== "object") {
    return c.json(errJson("content_filter.invalid_body", "Request body must be a JSON object"), 422);
  }
  const enabled = (body as { enabled?: unknown }).enabled;
  if (typeof enabled !== "boolean") {
    return c.json(errJson("content_filter.invalid_enabled", "enabled must be a boolean"), 422);
  }
  const existing = await getRule(c.env.REPORTS_DB, ruleId);
  if (existing === null) {
    return c.json(errJson("content_filter.not_found", "Rule not found"), 404);
  }
  await setEnabled(c.env.REPORTS_DB, ruleId, enabled);
  return c.json(rowToRule((await getRule(c.env.REPORTS_DB, ruleId))!));
});

// DELETE /:ruleId — remove a rule (admin only).
contentFilterRoutes.delete("/:ruleId", requireRole("admin"), async (c) => {
  const ruleId = Number(c.req.param("ruleId"));
  if (!Number.isInteger(ruleId)) {
    return c.json(errJson("content_filter.invalid_id", "rule id must be an integer"), 422);
  }
  const deleted = await removeRule(c.env.REPORTS_DB, ruleId);
  return c.json({ deleted });
});
