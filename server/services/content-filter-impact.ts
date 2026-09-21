import type { ContentFilterRuleRow } from "./content-filter-service";

export const BASELINE_IDENTITY = "content-filter-rules";
export const PORTABLE_REGEX_ERROR = "regex patterns for impact comparison must contain only literal branches separated by '|'";
export const PORTABLE_REGEX_LENGTH_ERROR = "regex pattern too long (max 200 Unicode code points)";
export const PORTABLE_AGE_ERROR = "age rules require an integer from 0 to 150 using ASCII digits [0-9]";
const MAX_PORTABLE_REGEX_CODE_POINTS = 200;
const MAX_PORTABLE_AGE = 150;
const REGEX_METACHARACTERS = new Set("\\.^$*+?{}[]()".split(""));

export interface DraftRule {
  id?: number;
  dimension: string;
  mode: string;
  value: string;
  enabled: boolean;
}

interface Link {
  name: string;
  href: string;
}

interface Actor extends Link {
  gender: string;
}

export interface RetainedMovieRow {
  href: string;
  title: string | null;
  video_code: string | null;
  release_date: string | null;
  categories: Link[] | null;
  actors: Actor[] | null;
  actor_birthdates: Record<string, string>;
  updated_at: string;
}

export interface ImpactDecision {
  outcome: "keep" | "drop" | "unknown";
  reasons: string[];
}

export interface ImpactComparison {
  href: string;
  title: string | null;
  video_code: string | null;
  updated_at: string;
  current: ImpactDecision;
  draft: ImpactDecision;
  decision_changed: boolean;
  reasons_changed: boolean;
  transition: "unchanged" | "newly_kept" | "newly_dropped" | "became_unknown" | "resolved_unknown";
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function sha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(stableStringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export async function baselineVersion(rules: ContentFilterRuleRow[]): Promise<string> {
  return sha256([...rules].sort((a, b) => a.id - b.id).map((rule) => ({
    dimension: rule.dimension,
    enabled: rule.enabled === 1,
    id: rule.id,
    mode: rule.mode,
    value: rule.value ?? "",
  })));
}

export async function cohortVersion(rows: RetainedMovieRow[]): Promise<string> {
  return sha256(rows.map((row) => ({
    actor_birthdates: row.actor_birthdates,
    actors: row.actors,
    categories: row.categories,
    href: row.href,
    release_date: row.release_date,
    title: row.title,
    updated_at: row.updated_at,
    video_code: row.video_code,
  })));
}

function jsonObjectList(value: unknown): Record<string, unknown>[] | null {
  if (value === null || value === undefined) return null;
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) && parsed.every((item) => item !== null && typeof item === "object" && !Array.isArray(item))
      ? parsed as Record<string, unknown>[]
      : null;
  } catch {
    return null;
  }
}

interface RawRetainedRow {
  href: string;
  title: string | null;
  video_code: string | null;
  release_date: string | null;
  categories: string | null;
  updated_at: string;
  ActorName: string | null;
  ActorGender: string | null;
  ActorLink: string | null;
  SupportingActors: string | null;
}

function actorPath(value: string | null | undefined): string {
  const href = (value ?? "").trim();
  if (!href) return "";
  if (href.startsWith("http://") || href.startsWith("https://")) {
    try {
      return new URL(href).pathname;
    } catch {
      return "";
    }
  }
  return href.startsWith("/") ? href : `/${href}`;
}

function actorsFromRow(row: RawRetainedRow): Actor[] | null {
  const name = (row.ActorName ?? "").trim();
  const gender = (row.ActorGender ?? "").trim();
  const href = actorPath(row.ActorLink);
  const supporting = jsonObjectList(row.SupportingActors);
  if (name === "N/A" && gender === "N/A" && href === "") return [];
  if (name === "" || supporting === null) return null;
  return [
    { name, gender, href },
    ...supporting.map((actor) => ({
      name: String(actor.name ?? ""),
      gender: String(actor.gender ?? ""),
      href: actorPath(String(actor.link ?? actor.href ?? "")),
    })),
  ];
}

export async function listRetainedCohort(db: D1Database, limit: number): Promise<RetainedMovieRow[]> {
  const result = await db.prepare(
    `SELECT mm.href, mm.title, mm.video_code, mm.release_date,
            mm.categories, mm.updated_at,
            mh.ActorName, mh.ActorGender, mh.ActorLink, mh.SupportingActors
       FROM MovieMetadata AS mm
       LEFT JOIN MovieHistory AS mh ON mh.Href = mm.href
      ORDER BY mm.updated_at DESC, mm.href ASC
      LIMIT ?`,
  ).bind(limit).all<RawRetainedRow>();
  const rows = result.results.map((raw) => {
    const categories = jsonObjectList(raw.categories);
    return {
      href: raw.href,
      title: raw.title,
      video_code: raw.video_code,
      release_date: raw.release_date,
      categories: categories?.map((item) => ({ name: String(item.name ?? ""), href: String(item.href ?? "") })) ?? null,
      actors: actorsFromRow(raw),
      actor_birthdates: {},
      updated_at: raw.updated_at,
    } satisfies RetainedMovieRow;
  });
  const hrefs = [...new Set(rows.flatMap((row) => row.actors?.map((actor) => actor.href).filter(Boolean) ?? []))].sort();
  const birthdates: Record<string, string> = {};
  for (let start = 0; start < hrefs.length; start += 90) {
    const chunk = hrefs.slice(start, start + 90);
    const placeholders = chunk.map(() => "?").join(",");
    const cached = await db.prepare(
      `SELECT actor_href, birthdate FROM ActorMetadata
        WHERE resolved = 1 AND birthdate IS NOT NULL
          AND actor_href IN (${placeholders})`,
    ).bind(...chunk).all<{ actor_href: string; birthdate: string }>();
    for (const item of cached.results) birthdates[item.actor_href] = item.birthdate;
  }
  for (const row of rows) {
    row.actor_birthdates = Object.fromEntries(
      (row.actors ?? []).filter((actor) => birthdates[actor.href]).map((actor) => [actor.href, birthdates[actor.href]]),
    );
  }
  return rows;
}

function parseIsoDate(value: unknown): Date | null {
  const text = portableTrim(String(value ?? "")).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const parsed = new Date(`${text}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text ? null : parsed;
}

function ageAt(birthdate: string, release: Date): number | null {
  const born = parseIsoDate(birthdate);
  if (!born || born > release) return null;
  let years = release.getUTCFullYear() - born.getUTCFullYear();
  if (
    release.getUTCMonth() < born.getUTCMonth()
    || (release.getUTCMonth() === born.getUTCMonth() && release.getUTCDate() < born.getUTCDate())
  ) years -= 1;
  return years;
}

function missingFields(row: RetainedMovieRow, rules: DraftRule[]): string[] {
  const missing = new Set<string>();
  const enabled = rules.filter((rule) => rule.enabled);
  const release = parseIsoDate(row.release_date);
  for (const rule of enabled) {
    if (rule.dimension === "tag" && row.categories === null) missing.add("categories");
    if (rule.dimension === "actor" && row.actors === null) missing.add("actors");
    if (rule.dimension === "gender") {
      if (row.actors === null) missing.add("actors");
      else if (row.actors.some((actor) => actor.gender.trim() === "")) missing.add("actor_gender");
    }
    if (rule.dimension === "release_date" && release === null) missing.add("release_date");
    if (rule.dimension === "age") {
      if (row.actors === null) missing.add("actors");
      else if (row.actors.some((actor) => !actor.href || !row.actor_birthdates[actor.href] || (release && ageAt(row.actor_birthdates[actor.href], release) === null))) missing.add("actor_age");
      if (release === null) missing.add("release_date");
    }
  }
  return [...missing].sort();
}

export function portableTrim(value: string | null | undefined): string {
  return (value ?? "").replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, "");
}

function normalized(value: string | null | undefined): string {
  return portableTrim(value).replace(/[A-Z]/g, (char) => char.toLowerCase());
}

function matchesLink(value: string, item: Link): boolean {
  const expected = normalized(value);
  return expected !== "" && (expected === normalized(item.name) || expected === normalized(item.href));
}

function compileRegex(pattern: string): RegExp | null {
  const clean = portableTrim(pattern);
  if (!clean) return null;
  try {
    return new RegExp(clean);
  } catch {
    return null;
  }
}

export function comparisonRuleError(rule: DraftRule): string | null {
  const value = portableTrim(rule.value);
  if (rule.dimension === "age" && (
    !/^[0-9]{1,3}$/.test(value)
    || Number(value) > MAX_PORTABLE_AGE
  )) return PORTABLE_AGE_ERROR;
  if (!["regex_exclude", "regex_include"].includes(rule.mode)) return null;
  const pattern = value;
  if ([...pattern].length > MAX_PORTABLE_REGEX_CODE_POINTS) return PORTABLE_REGEX_LENGTH_ERROR;
  const branches = pattern.split("|");
  if (
    pattern === ""
    || branches.some((branch) => branch === "")
    || [...pattern].some((char) => REGEX_METACHARACTERS.has(char))
    || [...pattern].some((char) => {
      const code = char.codePointAt(0) ?? 0;
      return code < 32 || code === 127;
    })
  ) return PORTABLE_REGEX_ERROR;
  return null;
}

function matchesRegex(pattern: string, item: Link): boolean {
  const compiled = compileRegex(pattern);
  return compiled !== null && (compiled.test(item.name ?? "") || compiled.test(item.href ?? ""));
}

function evaluateKnown(row: RetainedMovieRow, rules: DraftRule[]): ImpactDecision {
  const enabled = rules.filter((rule) => rule.enabled);
  const actors = row.actors ?? [];
  const tags = row.categories ?? [];
  for (const rule of enabled) {
    const items = rule.dimension === "actor" ? actors : rule.dimension === "tag" ? tags : [];
    const matched = rule.mode === "exclude"
      ? items.some((item) => matchesLink(rule.value, item))
      : rule.mode === "regex_exclude" && items.some((item) => matchesRegex(rule.value, item));
    if (matched) return { outcome: "drop", reasons: [`excluded by ${rule.dimension} rule: ${portableTrim(rule.value)}`] };
  }
  const reasons: string[] = [];
  const includeTags = enabled.filter((rule) => rule.dimension === "tag" && rule.mode === "include" && normalized(rule.value));
  if (includeTags.length && !includeTags.some((rule) => tags.some((tag) => matchesLink(rule.value, tag)))) {
    reasons.push(`missing required tag include: ${includeTags.map((rule) => portableTrim(rule.value)).join(", ")}`);
  }
  const regexIncludes = enabled.filter((rule) => ["actor", "tag"].includes(rule.dimension) && rule.mode === "regex_include" && compileRegex(rule.value));
  if (regexIncludes.length && !regexIncludes.some((rule) => (rule.dimension === "actor" ? actors : tags).some((item) => matchesRegex(rule.value, item)))) {
    reasons.push(`missing required regex include: ${regexIncludes.map((rule) => portableTrim(rule.value)).join(", ")}`);
  }
  for (const rule of enabled.filter((item) => item.dimension === "gender")) {
    if (rule.mode === "require_lead") {
      const actual = actors[0]?.gender ?? "";
      const expected = normalized(rule.value);
      if (normalized(actual) !== expected) reasons.push(`lead actor gender mismatch: expected ${expected}, got ${actual}`);
    } else if (rule.mode === "exclude_all_male" && actors.length && actors.every((actor) => normalized(actor.gender) === "male")) {
      reasons.push("all actors are male");
    }
  }
  const release = parseIsoDate(row.release_date);
  const ages = release ? actors.map((actor) => ageAt(row.actor_birthdates[actor.href], release)).filter((age): age is number => age !== null) : [];
  for (const rule of enabled.filter((item) => item.dimension === "age")) {
    const bound = Number.parseInt(portableTrim(rule.value), 10);
    if (rule.mode === "min_age" && ages.some((age) => age < bound)) reasons.push(`actor younger than minimum age ${bound}`);
    if (rule.mode === "max_age" && ages.some((age) => age > bound)) reasons.push(`actor older than maximum age ${bound}`);
  }
  if (release) {
    for (const rule of enabled.filter((item) => item.dimension === "release_date")) {
      const bound = parseIsoDate(rule.value);
      if (!bound) continue;
      const iso = bound.toISOString().slice(0, 10);
      if (rule.mode === "before" && release >= bound) reasons.push(`release date not before ${iso}`);
      if (rule.mode === "after" && release <= bound) reasons.push(`release date not after ${iso}`);
    }
  }
  return { outcome: reasons.length ? "drop" : "keep", reasons };
}

function evaluateRetained(row: RetainedMovieRow, rules: DraftRule[]): ImpactDecision {
  const missing = missingFields(row, rules);
  return missing.length
    ? { outcome: "unknown", reasons: missing.map((field) => `missing metadata: ${field}`) }
    : evaluateKnown(row, rules);
}

function transition(current: ImpactDecision["outcome"], draft: ImpactDecision["outcome"]): ImpactComparison["transition"] {
  if (current === draft) return "unchanged";
  if (current === "drop" && draft === "keep") return "newly_kept";
  if (current === "keep" && draft === "drop") return "newly_dropped";
  if (draft === "unknown") return "became_unknown";
  return "resolved_unknown";
}

function asDraftRules(rules: ContentFilterRuleRow[]): DraftRule[] {
  return rules.map((rule) => ({ ...rule, value: rule.value ?? "", enabled: rule.enabled === 1 }));
}

export function compareRetainedCohort(rows: RetainedMovieRow[], currentRules: ContentFilterRuleRow[], draftRules: DraftRule[]): ImpactComparison[] {
  const current = asDraftRules(currentRules);
  return rows.map((row) => {
    const currentDecision = evaluateRetained(row, current);
    const draftDecision = evaluateRetained(row, draftRules);
    return {
      href: row.href,
      title: row.title,
      video_code: row.video_code,
      updated_at: row.updated_at,
      current: currentDecision,
      draft: draftDecision,
      decision_changed: currentDecision.outcome !== draftDecision.outcome,
      reasons_changed: stableStringify(currentDecision.reasons) !== stableStringify(draftDecision.reasons),
      transition: transition(currentDecision.outcome, draftDecision.outcome),
    };
  });
}

export function summarizeComparisons(items: ImpactComparison[]) {
  const outcomes = () => ({ keep: 0, drop: 0, unknown: 0 });
  const current = outcomes();
  const draft = outcomes();
  const transitions = { unchanged: 0, newly_kept: 0, newly_dropped: 0, became_unknown: 0, resolved_unknown: 0 };
  const missing = new Map<string, number>();
  for (const item of items) {
    current[item.current.outcome] += 1;
    draft[item.draft.outcome] += 1;
    transitions[item.transition] += 1;
    const fields = new Set([...item.current.reasons, ...item.draft.reasons]
      .filter((reason) => reason.startsWith("missing metadata: "))
      .map((reason) => reason.slice("missing metadata: ".length)));
    for (const field of fields) missing.set(field, (missing.get(field) ?? 0) + 1);
  }
  return { current, draft, transitions, missing_metadata: Object.fromEntries([...missing.entries()].sort()) };
}
