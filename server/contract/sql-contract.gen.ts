// AUTO-GENERATED from javdb/storage/contract — DO NOT EDIT.
// Source of truth: ADR-055. Regenerate: python3 -m apps.cli.ops.dump_sql_contract
// version: 8388707dd033e195
/* eslint-disable */

export const WATCH_INTENT_UPSERT_SQL =
  `INSERT INTO WatchIntent (video_code, href, status, notes, status_at, updated_at) VALUES (?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')) ON CONFLICT(video_code) DO UPDATE SET href = excluded.href, status = excluded.status, notes = COALESCE(excluded.notes, notes), status_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`;

export function prepareWatchIntentUpsert(
  db: D1Database,
  p: { videoCode: string; href: string; status: string; notes: string | null },
): D1PreparedStatement {
  return db.prepare(WATCH_INTENT_UPSERT_SQL).bind(p.videoCode, p.href, p.status, p.notes);
}

export const ACTOR_SUBSCRIPTION_UPSERT_SQL =
  `INSERT INTO ActorSubscription (actor_href, actor_name, active, created_at, updated_at) VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')) ON CONFLICT(actor_href) DO UPDATE SET actor_name = excluded.actor_name, active = excluded.active, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`;

export function prepareActorSubscriptionUpsert(
  db: D1Database,
  p: { actorHref: string; actorName: string | null; active: number },
): D1PreparedStatement {
  return db.prepare(ACTOR_SUBSCRIPTION_UPSERT_SQL).bind(p.actorHref, p.actorName, p.active);
}

export const SYSTEM_STATE_UPSERT_SQL =
  `INSERT INTO system_state (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`;

export function prepareSystemStateUpsert(
  db: D1Database,
  p: { key: string; value: string },
): D1PreparedStatement {
  return db.prepare(SYSTEM_STATE_UPSERT_SQL).bind(p.key, p.value);
}

export const VALID_RULE_MODES: ReadonlySet<string> = new Set([
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

export const VALUE_REQUIRED: ReadonlySet<string> = new Set([
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

export const REPORT_SESSION_COLUMNS: readonly string[] = [
  "Id",
  "Status",
  "WriteMode",
  "RunId",
  "RunAttempt",
  "DateTimeCreated",
  "ReportType",
  "ReportDate",
  "FailureReason",
];
