import { beforeAll, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { app } from "../app";
import type { Env } from "../env";

type Session = { token: string; csrfToken: string; csrfCookie: string };

async function loginAs(
  requestEnv: Env,
  username: string,
  password: string,
  expectedRole: "admin" | "readonly",
): Promise<Session> {
  const res = await app.request(
    "/api/auth/login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    },
    requestEnv,
  );
  expect(res.status).toBe(200);
  const data = (await res.json()) as any;
  expect(data.role).toBe(expectedRole);
  expect(data.access_token).toEqual(expect.any(String));
  expect(data.access_token.length).toBeGreaterThan(0);
  expect(data.csrf_token).toEqual(expect.any(String));
  expect(data.csrf_token.length).toBeGreaterThan(0);
  return { token: data.access_token, csrfToken: data.csrf_token, csrfCookie: `csrf_token=${data.csrf_token}` };
}

async function postAggregate(
  session: Session,
  body: unknown,
  requestEnv: Env = env,
): Promise<Response> {
  return app.request(
    "/api/explore/aggregate-magnets",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.token}`,
        "Content-Type": "application/json",
        "X-CSRF-Token": session.csrfToken,
        Cookie: session.csrfCookie,
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    },
    requestEnv,
  );
}

describe("Explore aggregate magnets route", () => {
  let adminSession: Session;
  let readonlySession: Session;
  const readonlyEnv = {
    ...env,
    READONLY_USERNAME: "viewer",
    READONLY_PASSWORD_HASH: "plain:viewerpass",
  } as Env;

  beforeAll(async () => {
    adminSession = await loginAs(env, "admin", "testpassword123", "admin");
    readonlySession = await loginAs(readonlyEnv, "viewer", "viewerpass", "readonly");
  });

  it("POST /api/explore/aggregate-magnets returns unavailable in Cloudflare mode", async () => {
    const res = await postAggregate(adminSession, { video_code: "ABC-001" });

    expect(res.status).toBe(501);
    const data = (await res.json()) as any;
    expect(data.error.message).toBe("Multi-source magnet aggregation unavailable in Cloudflare mode (Python backend only).");
  });

  it("allows readonly users because the endpoint is not admin-only", async () => {
    const res = await postAggregate(readonlySession, { video_code: "ABC-001" }, readonlyEnv);

    expect(res.status).toBe(501);
  });

  it.each([
    ["blank video_code", { video_code: "" }],
    ["whitespace video_code", { video_code: "   " }],
    ["over 64 chars video_code", { video_code: "A".repeat(65) }],
    ["missing video_code", {}],
    ["non-string video_code", { video_code: 123 }],
    ["null body", null],
    ["malformed JSON", '{"video_code":'],
  ])("returns 422 for %s", async (_, body) => {
    const res = await postAggregate(adminSession, body);

    expect(res.status).toBe(422);
    const data = (await res.json()) as any;
    expect(data.error.message).toBe("video_code required (max 64 chars)");
  });
});
