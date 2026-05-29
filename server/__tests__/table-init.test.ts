import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { initializeTables } from "../services/table-init";

describe("initializeTables", () => {
  it("creates job_runs table in OPERATIONS_DB", async () => {
    await initializeTables(env);

    const result = await env.OPERATIONS_DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='job_runs'",
    ).first<{ name: string }>();
    expect(result?.name).toBe("job_runs");
  });

  it("creates system_state table in OPERATIONS_DB", async () => {
    await initializeTables(env);

    const result = await env.OPERATIONS_DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='system_state'",
    ).first<{ name: string }>();
    expect(result?.name).toBe("system_state");
  });

  it("creates api_config table in OPERATIONS_DB", async () => {
    await initializeTables(env);

    const result = await env.OPERATIONS_DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='api_config'",
    ).first<{ name: string }>();
    expect(result?.name).toBe("api_config");
  });

  it("is idempotent — running twice does not error", async () => {
    await initializeTables(env);
    await initializeTables(env);
    // No error thrown
  });
});
