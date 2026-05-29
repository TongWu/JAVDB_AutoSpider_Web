import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { findUser } from "../services/users";

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

describe("findUser", () => {
  beforeEach(async () => {
    await ensureConfigTable(env.OPERATIONS_DB);
    await clearConfigTable(env.OPERATIONS_DB);
  });

  it("returns admin user from env when D1 has no password hash", async () => {
    const user = await findUser(env, env.OPERATIONS_DB, "admin");
    expect(user).toBeDefined();
    expect(user!.username).toBe("admin");
    expect(user!.role).toBe("admin");
    expect(user!.passwordHash).toBe("plain:testpassword123");
  });

  it("returns undefined for unknown username", async () => {
    const user = await findUser(env, env.OPERATIONS_DB, "nobody");
    expect(user).toBeUndefined();
  });

  it("uses D1 password hash when present (overrides env)", async () => {
    await env.OPERATIONS_DB.prepare(
      `INSERT INTO api_config (key, value) VALUES ('ADMIN_PASSWORD_HASH', '"$2a$10$d1hashvalue"')`,
    ).run();

    const user = await findUser(env, env.OPERATIONS_DB, "admin");
    expect(user).toBeDefined();
    expect(user!.passwordHash).toBe("$2a$10$d1hashvalue");
  });

  it("uses D1 password hash for readonly user", async () => {
    // env has READONLY_USERNAME and READONLY_PASSWORD_HASH undefined in test config.
    // We need to simulate env having them set.
    const envWithReadonly = {
      ...env,
      READONLY_USERNAME: "viewer",
      READONLY_PASSWORD_HASH: "plain:viewerpass",
    } as typeof env;

    const user = await findUser(envWithReadonly, env.OPERATIONS_DB, "viewer");
    expect(user).toBeDefined();
    expect(user!.role).toBe("readonly");
    expect(user!.passwordHash).toBe("plain:viewerpass");

    // Now set D1 override
    await env.OPERATIONS_DB.prepare(
      `INSERT INTO api_config (key, value) VALUES ('READONLY_PASSWORD_HASH', '"$2a$10$readonlyhash"')`,
    ).run();

    const user2 = await findUser(envWithReadonly, env.OPERATIONS_DB, "viewer");
    expect(user2!.passwordHash).toBe("$2a$10$readonlyhash");
  });
});
