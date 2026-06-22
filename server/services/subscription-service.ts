// Actor-subscription + new-works D1 queries (ADR-054 WS2).
// Keep this module free of Hono / c.env references; callers pass the binding.

import { prepareActorSubscriptionUpsert } from "../contract/sql-contract.gen";

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

export async function upsertSubscription(
  db: D1Database,
  actorHref: string,
  actorName: string | null,
  active: number,
): Promise<ActorSubscriptionRow> {
  await prepareActorSubscriptionUpsert(db, { actorHref, actorName, active }).run();
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
  actorHref: string | null = null,
): Promise<boolean> {
  // actorHref scopes the dismiss to a single followed actor's feed row (the
  // same release can occupy one row per actor, composite PK); omitting it
  // dismisses the release across every actor's feed (back-compat). Mirrors
  // the Python NewWorksRepo.dismiss contract (issue #229).
  const res = actorHref
    ? await db
        .prepare(
          "UPDATE NewWorks SET dismissed = 1 WHERE video_code = ? AND actor_href = ?",
        )
        .bind(videoCode, actorHref)
        .run()
    : await db
        .prepare("UPDATE NewWorks SET dismissed = 1 WHERE video_code = ?")
        .bind(videoCode)
        .run();
  return (res.meta?.changes ?? 0) > 0;
}
