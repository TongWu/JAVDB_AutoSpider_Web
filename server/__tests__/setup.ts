import { beforeEach } from "vitest";
import { env } from "cloudflare:test";

// Reset KV-backed auth state (rate-limit counters, session lists, revocations)
// before each test. Without this, the per-IP rate limiter and per-user session
// counter accumulate across tests in a file (storage is not per-test isolated)
// and every login after the 5th is throttled, breaking unrelated route tests.
beforeEach(async () => {
  const { keys } = await env.AUTH_KV.list();
  await Promise.all(keys.map((k) => env.AUTH_KV.delete(k.name)));
});
