import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { checkRateLimit } from "../services/rate-limit";

describe("checkRateLimit", () => {
  it("allows requests under the limit", async () => {
    const result = await checkRateLimit(env.AUTH_KV, "1.2.3.4", "/api/auth/login", 5, 60);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("blocks requests over the limit", async () => {
    const ip = "10.0.0.1";
    const endpoint = "/api/auth/login-block-test";
    for (let i = 0; i < 5; i++) {
      await checkRateLimit(env.AUTH_KV, ip, endpoint, 5, 60);
    }
    const result = await checkRateLimit(env.AUTH_KV, ip, endpoint, 5, 60);
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it("uses separate counters per IP", async () => {
    const endpoint = "/api/auth/login-ip-test";
    for (let i = 0; i < 5; i++) {
      await checkRateLimit(env.AUTH_KV, "192.168.1.1", endpoint, 5, 60);
    }
    const result = await checkRateLimit(env.AUTH_KV, "192.168.1.2", endpoint, 5, 60);
    expect(result.allowed).toBe(true);
  });
});
