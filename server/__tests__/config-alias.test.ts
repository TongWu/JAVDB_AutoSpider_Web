import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { loadConfigStore, saveConfigKeys } from "../services/config-store";

async function ensureConfigTable(db: D1Database) {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS api_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
  ).run();
}

async function clearConfigTable(db: D1Database) {
  await db.prepare("DELETE FROM api_config").run();
}

describe("config alias fallback", () => {
  beforeEach(async () => {
    await ensureConfigTable(env.OPERATIONS_DB);
    await clearConfigTable(env.OPERATIONS_DB);
  });

  it("loads canonical name when present", async () => {
    await env.OPERATIONS_DB.prepare(
      "INSERT INTO api_config (key, value) VALUES ('SMTP_SERVER', '\"smtp.example.com\"')",
    ).run();

    const config = await loadConfigStore(env.OPERATIONS_DB);
    expect(config.SMTP_SERVER).toBe("smtp.example.com");
  });

  it("falls back to alias when canonical name is absent", async () => {
    await env.OPERATIONS_DB.prepare(
      "INSERT INTO api_config (key, value) VALUES ('SMTP_HOST', '\"smtp.old.com\"')",
    ).run();

    const config = await loadConfigStore(env.OPERATIONS_DB);
    expect(config.SMTP_SERVER).toBe("smtp.old.com");
  });

  it("canonical name takes priority over alias", async () => {
    await env.OPERATIONS_DB.prepare(
      "INSERT INTO api_config (key, value) VALUES ('SMTP_SERVER', '\"smtp.new.com\"')",
    ).run();
    await env.OPERATIONS_DB.prepare(
      "INSERT INTO api_config (key, value) VALUES ('SMTP_HOST', '\"smtp.old.com\"')",
    ).run();

    const config = await loadConfigStore(env.OPERATIONS_DB);
    expect(config.SMTP_SERVER).toBe("smtp.new.com");
  });

  it("applies alias fallback for PAGE_START and PAGE_END", async () => {
    await env.OPERATIONS_DB.prepare(
      "INSERT INTO api_config (key, value) VALUES ('START_PAGE', '5')",
    ).run();
    await env.OPERATIONS_DB.prepare(
      "INSERT INTO api_config (key, value) VALUES ('END_PAGE', '10')",
    ).run();

    const config = await loadConfigStore(env.OPERATIONS_DB);
    expect(config.PAGE_START).toBe(5);
    expect(config.PAGE_END).toBe(10);
  });

  it("saveConfigKeys writes canonical name only", async () => {
    await saveConfigKeys(env.OPERATIONS_DB, { SMTP_SERVER: "smtp.saved.com" });

    const row = await env.OPERATIONS_DB.prepare(
      "SELECT key FROM api_config WHERE key = 'SMTP_SERVER'",
    ).first<{ key: string }>();
    expect(row?.key).toBe("SMTP_SERVER");

    const aliasRow = await env.OPERATIONS_DB.prepare(
      "SELECT key FROM api_config WHERE key = 'SMTP_HOST'",
    ).first<{ key: string }>();
    expect(aliasRow).toBeNull();
  });
});
