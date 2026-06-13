// Shared UPSERT for the `system_state` key/value table.
//
// Consolidates the identical `INSERT ... ON CONFLICT(key) DO UPDATE` statement
// that was previously duplicated across the onboarding and system-state routes.
//
// This statement is intentionally NOT part of the cross-backend query Contract
// Golden — ADR-018 D3 / ADR-047 D6 exclude these static `system_state` writes
// as low-leverage — so this is a pure intra-backend deduplication. The rows
// written and the bindings passed are unchanged; only the duplicated SQL text
// is collapsed into one place.
export async function upsertSystemState(
  db: D1Database,
  key: string,
  value: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO system_state (key, value, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value,
                                       updated_at = datetime('now')`,
    )
    .bind(key, value)
    .run();
}
