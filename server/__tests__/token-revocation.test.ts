import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { revokeToken, isTokenRevoked, trackSession, getSessionCount, cleanExpiredSessions } from "../services/token-revocation";

describe("revokeToken / isTokenRevoked", () => {
  it("marks a token as revoked", async () => {
    await revokeToken(env.AUTH_KV, "jti-abc", 1800);
    const revoked = await isTokenRevoked(env.AUTH_KV, "jti-abc");
    expect(revoked).toBe(true);
  });

  it("returns false for non-revoked token", async () => {
    const revoked = await isTokenRevoked(env.AUTH_KV, "jti-unknown");
    expect(revoked).toBe(false);
  });
});

describe("trackSession / getSessionCount", () => {
  it("tracks a new session", async () => {
    const now = Math.floor(Date.now() / 1000);
    await trackSession(env.AUTH_KV, "user-a", "jti-1", now + 1800);
    const count = await getSessionCount(env.AUTH_KV, "user-a");
    expect(count).toBe(1);
  });

  it("tracks multiple sessions", async () => {
    const now = Math.floor(Date.now() / 1000);
    await trackSession(env.AUTH_KV, "user-b", "jti-2", now + 1800);
    await trackSession(env.AUTH_KV, "user-b", "jti-3", now + 1800);
    const count = await getSessionCount(env.AUTH_KV, "user-b");
    expect(count).toBe(2);
  });

  it("cleanExpiredSessions removes expired entries", async () => {
    const past = Math.floor(Date.now() / 1000) - 10;
    const future = Math.floor(Date.now() / 1000) + 1800;
    await trackSession(env.AUTH_KV, "user-c", "jti-old", past);
    await trackSession(env.AUTH_KV, "user-c", "jti-new", future);
    await cleanExpiredSessions(env.AUTH_KV, "user-c");
    const count = await getSessionCount(env.AUTH_KV, "user-c");
    expect(count).toBe(1);
  });
});
