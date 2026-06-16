// Shared UPSERT for the `system_state` key/value table.
//
// The SQL + bind order are sourced from the ADR-055 contract registry
// (javdb/storage/contract) and emitted into server/contract/sql-contract.gen.ts;
// this wrapper preserves the (db, key, value) call sites across the onboarding
// and system-state routes.
import { prepareSystemStateUpsert } from "../contract/sql-contract.gen";

export async function upsertSystemState(
  db: D1Database,
  key: string,
  value: string,
): Promise<void> {
  await prepareSystemStateUpsert(db, { key, value }).run();
}
