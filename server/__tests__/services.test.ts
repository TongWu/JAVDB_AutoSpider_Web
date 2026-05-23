import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { createJobRunsRepo } from "../services/job-runs";

describe("JobRunsRepo", () => {
  const repo = createJobRunsRepo(env.OPERATIONS_DB);

  beforeAll(async () => {
    await repo.ensureTable();
  });

  it("creates a job run and retrieves it", async () => {
    const job = await repo.create("daily", "DailyIngestion.yml", { start_page: "1" });

    expect(job.job_id).toMatch(/^daily-\d{8}-\d{6}-[0-9a-f]{4}$/);
    expect(job.workflow).toBe("DailyIngestion.yml");
    expect(job.status).toBe("dispatched");
    expect(job.gh_run_id).toBeNull();
    expect(job.inputs).toBe('{"start_page":"1"}');
    expect(job.created_at).toBeTruthy();

    const fetched = await repo.get(job.job_id);
    expect(fetched).not.toBeNull();
    expect(fetched!.job_id).toBe(job.job_id);
  });

  it("updates job status with gh_run_id", async () => {
    const job = await repo.create("adhoc", "AdHocIngestion.yml");

    await repo.updateStatus(job.job_id, "running", 99001);
    const updated = await repo.get(job.job_id);
    expect(updated!.status).toBe("running");
    expect(updated!.gh_run_id).toBe(99001);

    await repo.updateStatus(job.job_id, "completed");
    const final = await repo.get(job.job_id);
    expect(final!.status).toBe("completed");
    expect(final!.gh_run_id).toBe(99001); // preserved from previous update
  });

  it("lists jobs ordered by created_at desc", async () => {
    // Insert two more jobs to have enough data
    await repo.create("dedup", "WeeklyDedup.yml");
    await repo.create("filter", "QBFileFilter.yml");

    const jobs = await repo.list(10);
    expect(jobs.length).toBeGreaterThanOrEqual(4);

    // Verify descending order
    for (let i = 1; i < jobs.length; i++) {
      expect(jobs[i - 1].created_at >= jobs[i].created_at).toBe(true);
    }
  });

  it("returns stats for last 7 days", async () => {
    const stats = await repo.stats();
    expect(stats.total).toBeGreaterThanOrEqual(4);
    expect(stats.dispatched).toBeGreaterThanOrEqual(2);
    expect(stats.completed).toBeGreaterThanOrEqual(1);
    expect(typeof stats.running).toBe("number");
    expect(typeof stats.failed).toBe("number");
  });
});
