// server/__tests__/capabilities-closed-loop.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { app } from "../app";

async function getToken(): Promise<string> {
  const res = await app.request(
    "/api/auth/login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "testpassword123" }),
    },
    env,
  );
  expect(res.status).toBe(200);
  const body = (await res.json()) as { access_token?: string };
  expect(typeof body.access_token).toBe("string");
  return body.access_token as string;
}

describe("capabilities closed_loop", () => {
  beforeAll(async () => {
    await env.OPERATIONS_DB.prepare(
      "CREATE TABLE IF NOT EXISTS AcquisitionOutcome (qb_hash TEXT PRIMARY KEY NOT NULL, state TEXT)",
    ).run();
  });

  it("exposes a boolean closed_loop flag (true when table exists)", async () => {
    const token = await getToken();
    const res = await app.request(
      "/api/capabilities",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(200);
    const features = ((await res.json()) as { features: Record<string, unknown> }).features;
    expect(typeof features.closed_loop).toBe("boolean");
    expect(features.closed_loop).toBe(true);
  });
});
