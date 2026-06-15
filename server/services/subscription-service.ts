// Actor-subscription + new-works D1 queries (ADR-054 WS2).
// Keep this module free of Hono / c.env references; callers pass the binding.

export interface ActorSubscriptionRow {
  actor_href: string;
  actor_name: string | null;
  active: number;
  last_seen_href: string | null;
  last_checked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface NewWorkRow {
  video_code: string;
  href: string;
  actor_href: string;
  title: string | null;
  release_date: string | null;
  discovered_at: string;
  dismissed: number;
}

// Byte-mirrored with javdb/storage/repos/subscription_repo.py
// ACTOR_SUBSCRIPTION_UPSERT_SQL (ADR-017 dual-backend parity). Cursor columns
// are advanced by the monitor, not follow/unfollow, so they stay untouched.
export const ACTOR_SUBSCRIPTION_UPSERT_SQL = `
    INSERT INTO ActorSubscription
        (actor_href, actor_name, active, created_at, updated_at)
    VALUES (?, ?, ?,
        strftime('%Y-%m-%dT%H:%M:%fZ','now'),
        strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(actor_href) DO UPDATE SET
        actor_name = excluded.actor_name,
        active     = excluded.active,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`;

export async function upsertSubscription(
  db: D1Database,
  actorHref: string,
  actorName: string | null,
  active: number,
): Promise<ActorSubscriptionRow> {
  await db
    .prepare(ACTOR_SUBSCRIPTION_UPSERT_SQL)
    .bind(actorHref, actorName, active)
    .run();
  return (await getSubscription(db, actorHref))!;
}

export async function getSubscription(
  db: D1Database,
  actorHref: string,
): Promise<ActorSubscriptionRow | null> {
  return db
    .prepare("SELECT * FROM ActorSubscription WHERE actor_href = ?")
    .bind(actorHref)
    .first<ActorSubscriptionRow>();
}

export async function listSubscriptions(
  db: D1Database,
  activeOnly: boolean,
  limit: number,
  offset: number,
): Promise<{ items: ActorSubscriptionRow[]; total: number }> {
  const where = activeOnly ? "WHERE active = 1" : "";

  const total =
    (await db
      .prepare(`SELECT COUNT(*) AS n FROM ActorSubscription ${where}`)
      .first<{ n: number }>())?.n ?? 0;

  const rows = await db
    .prepare(
      `SELECT * FROM ActorSubscription ${where} ORDER BY updated_at DESC, actor_href ASC LIMIT ? OFFSET ?`,
    )
    .bind(limit, offset)
    .all<ActorSubscriptionRow>();

  return { items: rows.results, total };
}

export async function deleteSubscription(
  db: D1Database,
  actorHref: string,
): Promise<boolean> {
  const res = await db
    .prepare("DELETE FROM ActorSubscription WHERE actor_href = ?")
    .bind(actorHref)
    .run();
  return (res.meta?.changes ?? 0) > 0;
}

export async function listNewWorks(
  db: D1Database,
  actorHref: string | null,
  includeDismissed: boolean,
  limit: number,
  offset: number,
): Promise<{ items: NewWorkRow[]; total: number }> {
  const clauses: string[] = [];
  const bindings: (string | number)[] = [];
  if (!includeDismissed) clauses.push("dismissed = 0");
  if (actorHref) {
    clauses.push("actor_href = ?");
    bindings.push(actorHref);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const total =
    (await db
      .prepare(`SELECT COUNT(*) AS n FROM NewWorks ${where}`)
      .bind(...bindings)
      .first<{ n: number }>())?.n ?? 0;

  const rows = await db
    .prepare(
      `SELECT * FROM NewWorks ${where} ORDER BY discovered_at DESC, video_code ASC LIMIT ? OFFSET ?`,
    )
    .bind(...bindings, limit, offset)
    .all<NewWorkRow>();

  return { items: rows.results, total };
}

export async function dismissNewWork(
  db: D1Database,
  videoCode: string,
): Promise<boolean> {
  const res = await db
    .prepare("UPDATE NewWorks SET dismissed = 1 WHERE video_code = ?")
    .bind(videoCode)
    .run();
  return (res.meta?.changes ?? 0) > 0;
}
