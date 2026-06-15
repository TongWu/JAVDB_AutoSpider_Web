// Content-filter CRUD D1 queries (ADR-040 Phase 4 / WS4a).
// Keep this module free of Hono / c.env references; callers pass the binding.
// CRITICAL: callers MUST pass env.REPORTS_DB (javdb-reports) — ContentFilterRule
// lives in REPORTS_DB, NOT HISTORY_DB. This mirrors the Python ContentFilterRepo,
// which opens REPORTS_DB_PATH (apps/cli/ops/content_filter.py).

export interface ContentFilterRuleRow {
  id: number;
  dimension: string;
  mode: string;
  value: string | null;
  enabled: number;
}

export async function listRules(db: D1Database): Promise<ContentFilterRuleRow[]> {
  const rows = await db
    .prepare(
      "SELECT id, dimension, mode, value, enabled FROM ContentFilterRule ORDER BY id ASC",
    )
    .all<ContentFilterRuleRow>();
  return rows.results;
}

export async function getRule(
  db: D1Database,
  id: number,
): Promise<ContentFilterRuleRow | null> {
  return db
    .prepare("SELECT id, dimension, mode, value, enabled FROM ContentFilterRule WHERE id = ?")
    .bind(id)
    .first<ContentFilterRuleRow>();
}

export async function addRule(
  db: D1Database,
  dimension: string,
  mode: string,
  value: string,
): Promise<ContentFilterRuleRow> {
  const res = await db
    .prepare("INSERT INTO ContentFilterRule (dimension, mode, value, enabled) VALUES (?, ?, ?, 1)")
    .bind(dimension, mode, value)
    .run();
  const id = Number(res.meta?.last_row_id ?? 0);
  return (await getRule(db, id))!;
}

export async function setEnabled(
  db: D1Database,
  id: number,
  enabled: boolean,
): Promise<void> {
  await db
    .prepare("UPDATE ContentFilterRule SET enabled = ? WHERE id = ?")
    .bind(enabled ? 1 : 0, id)
    .run();
}

export async function removeRule(db: D1Database, id: number): Promise<boolean> {
  const res = await db.prepare("DELETE FROM ContentFilterRule WHERE id = ?").bind(id).run();
  return (res.meta?.changes ?? 0) > 0;
}
