export interface JobRun {
  job_id: string;
  workflow: string;
  gh_run_id: number | null;
  status: string;
  inputs: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Generate a job ID in the format: {kind}-{YYYYMMDD}-{HHMMSS}-{4-hex-chars}
 */
function generateJobId(kind: string): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const time = now.toISOString().slice(11, 19).replace(/:/g, "");
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(2)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${kind}-${date}-${time}-${hex}`;
}

export function createJobRunsRepo(db: D1Database) {
  return {
    async ensureTable(): Promise<void> {
      await db
        .prepare(
          `CREATE TABLE IF NOT EXISTS job_runs (
            job_id       TEXT PRIMARY KEY,
            workflow     TEXT NOT NULL,
            gh_run_id    INTEGER,
            status       TEXT NOT NULL DEFAULT 'dispatched',
            inputs       TEXT,
            created_at   TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
          )`,
        )
        .run();
    },

    async create(kind: string, workflow: string, inputs?: Record<string, unknown>): Promise<JobRun> {
      const jobId = generateJobId(kind);
      const inputsJson = inputs ? JSON.stringify(inputs) : null;

      await db
        .prepare(
          `INSERT INTO job_runs (job_id, workflow, inputs) VALUES (?, ?, ?)`,
        )
        .bind(jobId, workflow, inputsJson)
        .run();

      const row = await db
        .prepare("SELECT * FROM job_runs WHERE job_id = ?")
        .bind(jobId)
        .first<JobRun>();

      if (!row) throw new Error(`Failed to retrieve created job: ${jobId}`);
      return row;
    },

    async updateStatus(jobId: string, status: string, ghRunId?: number): Promise<void> {
      if (ghRunId !== undefined) {
        await db
          .prepare(
            `UPDATE job_runs SET status = ?, gh_run_id = ?, updated_at = datetime('now') WHERE job_id = ?`,
          )
          .bind(status, ghRunId, jobId)
          .run();
      } else {
        await db
          .prepare(
            `UPDATE job_runs SET status = ?, updated_at = datetime('now') WHERE job_id = ?`,
          )
          .bind(status, jobId)
          .run();
      }
    },

    async get(jobId: string): Promise<JobRun | null> {
      return db
        .prepare("SELECT * FROM job_runs WHERE job_id = ?")
        .bind(jobId)
        .first<JobRun>();
    },

    async list(limit = 50): Promise<JobRun[]> {
      const result = await db
        .prepare("SELECT * FROM job_runs ORDER BY created_at DESC LIMIT ?")
        .bind(limit)
        .all<JobRun>();
      return result.results;
    },

    async stats(): Promise<Record<string, number>> {
      const result = await db
        .prepare(
          `SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN status = 'dispatched' THEN 1 ELSE 0 END) AS dispatched,
            SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) AS running,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
            SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
          FROM job_runs
          WHERE created_at >= datetime('now', '-7 days')`,
        )
        .first<Record<string, number>>();

      return result ?? { total: 0, dispatched: 0, running: 0, completed: 0, failed: 0 };
    },
  };
}

export type JobRunsRepo = ReturnType<typeof createJobRunsRepo>;
