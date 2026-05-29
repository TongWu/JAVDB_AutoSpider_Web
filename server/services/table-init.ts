import type { Env } from "../env";

export async function initializeTables(env: Env): Promise<void> {
  await env.OPERATIONS_DB.batch([
    env.OPERATIONS_DB.prepare(
      `CREATE TABLE IF NOT EXISTS job_runs (
        job_id       TEXT PRIMARY KEY,
        workflow     TEXT NOT NULL,
        gh_run_id    INTEGER,
        status       TEXT NOT NULL DEFAULT 'dispatched',
        inputs       TEXT,
        created_at   TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    ),
    env.OPERATIONS_DB.prepare(
      `CREATE TABLE IF NOT EXISTS system_state (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    ),
    env.OPERATIONS_DB.prepare(
      `CREATE TABLE IF NOT EXISTS api_config (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    ),
  ]);
}
