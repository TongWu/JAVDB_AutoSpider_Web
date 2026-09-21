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
import {
  BASELINE_IDENTITY,
  baselineVersion,
  cohortVersion,
  compareRetainedCohort,
  listRetainedCohort,
  summarizeComparisons,
  type DraftRule,
} from "../services/content-filter-impact";
import { VALID_RULE_MODES, VALUE_REQUIRED } from "../contract/sql-contract.gen";

type CfEnv = { Bindings: Env; Variables: { user: JwtPayload } };

export const contentFilterRoutes = new Hono<CfEnv>();

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

const MAX_REGEX_LENGTH = 200;
const UNBOUNDED_QUANTIFIER = String.raw`(?:[*+]|\{\d+,\})`;
const NESTED_QUANTIFIER = new RegExp(String.raw`\([^()]*${UNBOUNDED_QUANTIFIER}[^()]*\)${UNBOUNDED_QUANTIFIER}`);
const QUANTIFIED_ALTERNATION = new RegExp(String.raw`\([^()]*\|[^()]*\)${UNBOUNDED_QUANTIFIER}`);

function validateRuleValue(dimension: string, mode: string, rawValue: string): { value: string } | { error: string } {
  const value = rawValue.trim();
  const key = `${dimension}:${mode}`;
  if (VALUE_REQUIRED.has(key) && value.length === 0) {
    return { error: `${dimension} ${mode} rules require a non-empty value` };
  }
  if (key === "gender:require_lead") {
    const normalized = value.toLocaleLowerCase();
    return ["female", "male"].includes(normalized)
      ? { value: normalized }
      : { error: "gender require_lead rules require a value of ('female', 'male')" };
  }
  if (key === "gender:exclude_all_male") {
    return value ? { error: "gender exclude_all_male rules do not accept a value" } : { value: "" };
  }
  if (dimension === "age") {
    return /^\d+$/.test(value)
      ? { value: String(Number.parseInt(value, 10)) }
      : { error: "age rules require a non-negative integer value" };
  }
  if (dimension === "release_date") {
    const normalized = parseIsoDate(value);
    return normalized
      ? { value: normalized }
      : { error: "release_date rules require an ISO date (YYYY-MM-DD)" };
  }
  if (["regex_exclude", "regex_include"].includes(mode)) {
    if (value.length > MAX_REGEX_LENGTH) return { error: `regex pattern too long (max ${MAX_REGEX_LENGTH} characters)` };
    if (NESTED_QUANTIFIER.test(value)) return { error: "regex pattern has nested quantifiers (catastrophic-backtracking risk)" };
    if (QUANTIFIED_ALTERNATION.test(value)) return { error: "regex pattern has a quantified alternation (catastrophic-backtracking risk)" };
  }
  return { value };
}

function parseDraftRules(value: unknown): { rules: DraftRule[] } | { error: string } {
  if (!Array.isArray(value)) return { error: "draft_rules must be an array" };
  const rules: DraftRule[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    if (item === null || typeof item !== "object") return { error: `draft_rules[${index}] must be an object` };
    const candidate = item as Record<string, unknown>;
    const dimension = typeof candidate.dimension === "string" ? candidate.dimension : "";
    const mode = typeof candidate.mode === "string" ? candidate.mode : "";
    if (!VALID_RULE_MODES.has(`${dimension}:${mode}`)) return { error: `${dimension} rules do not support mode '${mode}'` };
    if (candidate.value !== undefined && typeof candidate.value !== "string") return { error: `draft_rules[${index}].value must be a string` };
    if (candidate.enabled !== undefined && typeof candidate.enabled !== "boolean") return { error: `draft_rules[${index}].enabled must be a boolean` };
    if (candidate.id !== undefined && !Number.isInteger(candidate.id)) return { error: `draft_rules[${index}].id must be an integer` };
    const validated = validateRuleValue(dimension, mode, String(candidate.value ?? ""));
    if ("error" in validated) return { error: validated.error };
    rules.push({
      id: candidate.id === undefined ? -(index + 1) : candidate.id as number,
      dimension,
      mode,
      value: validated.value,
      enabled: candidate.enabled === undefined ? true : candidate.enabled,
    });
  }
  return { rules };
}

// GET / — list all rules (auth only; the read-side overlay needs this).
contentFilterRoutes.get("/", async (c) => {
  const rows = await listRules(c.env.REPORTS_DB);
  const items = rows.map(rowToRule);
  return c.json({
    items,
    total: items.length,
    baseline_identity: BASELINE_IDENTITY,
    baseline_version: await baselineVersion(rows),
  });
});

contentFilterRoutes.post("/impact", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(errJson("content_filter.invalid_body", "Request body must be valid JSON"), 422);
  }
  if (body === null || typeof body !== "object") {
    return c.json(errJson("content_filter.invalid_body", "Request body must be a JSON object"), 422);
  }
  const input = body as Record<string, unknown>;
  if (typeof input.baseline_version !== "string") {
    return c.json(errJson("content_filter.invalid_baseline", "baseline_version must be a string"), 422);
  }
  const cohortSize = input.cohort_size === undefined ? 500 : input.cohort_size;
  const page = input.page === undefined ? 1 : input.page;
  const pageSize = input.page_size === undefined ? 100 : input.page_size;
  if (!Number.isInteger(cohortSize) || Number(cohortSize) < 1 || Number(cohortSize) > 5000) {
    return c.json(errJson("content_filter.invalid_cohort_size", "cohort_size must be an integer from 1 to 5000"), 422);
  }
  if (!Number.isInteger(page) || Number(page) < 1) {
    return c.json(errJson("content_filter.invalid_page", "page must be a positive integer"), 422);
  }
  if (!Number.isInteger(pageSize) || Number(pageSize) < 1 || Number(pageSize) > 500) {
    return c.json(errJson("content_filter.invalid_page_size", "page_size must be an integer from 1 to 500"), 422);
  }
  if (input.expected_cohort_version !== undefined && typeof input.expected_cohort_version !== "string") {
    return c.json(errJson("content_filter.invalid_cohort_version", "expected_cohort_version must be a string"), 422);
  }

  const currentRules = await listRules(c.env.REPORTS_DB);
  const currentBaselineVersion = await baselineVersion(currentRules);
  if (input.baseline_version !== currentBaselineVersion) {
    return c.json({
      ...errJson("content_filter.baseline_changed", "Saved content-filter rules changed; compare again"),
      baseline_identity: BASELINE_IDENTITY,
      baseline_version: currentBaselineVersion,
    }, 409);
  }
  const parsedDraft = parseDraftRules(input.draft_rules);
  if ("error" in parsedDraft) return c.json(errJson("content_filter.invalid_value", parsedDraft.error), 422);
  const rows = await listRetainedCohort(c.env.HISTORY_DB, Number(cohortSize));
  const currentCohortVersion = await cohortVersion(rows);
  if (input.expected_cohort_version !== undefined && input.expected_cohort_version !== currentCohortVersion) {
    return c.json({
      ...errJson("content_filter.cohort_changed", "Retained comparison cohort changed; compare again"),
      cohort_version: currentCohortVersion,
    }, 409);
  }
  const comparisons = compareRetainedCohort(rows, currentRules, parsedDraft.rules);
  const offset = (Number(page) - 1) * Number(pageSize);
  const items = comparisons.slice(offset, offset + Number(pageSize));
  const known = (side: "current" | "draft") => comparisons.filter((item) => item[side].outcome !== "unknown").length;
  return c.json({
    baseline_identity: BASELINE_IDENTITY,
    baseline_version: currentBaselineVersion,
    cohort_version: currentCohortVersion,
    cohort_size: Number(cohortSize),
    page: Number(page),
    page_size: Number(pageSize),
    total: comparisons.length,
    has_more: offset + items.length < comparisons.length,
    coverage: {
      total: comparisons.length,
      current_known: known("current"),
      draft_known: known("draft"),
      both_known: comparisons.filter((item) => item.current.outcome !== "unknown" && item.draft.outcome !== "unknown").length,
    },
    summary: summarizeComparisons(comparisons),
    items,
  });
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
  const validated = validateRuleValue(dimension, mode, value);
  if ("error" in validated) {
    return c.json(errJson("content_filter.invalid_value", validated.error), 422);
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
