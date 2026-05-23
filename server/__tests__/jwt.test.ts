import { describe, it, expect } from "vitest";
import { signJwt, verifyJwt, generateJti } from "../services/jwt";

const SECRET = "test-secret-key-at-least-32-chars-long";

describe("JWT service", () => {
  it("signs and verifies a token", async () => {
    const payload = { sub: "admin", role: "admin", typ: "access" as const };
    const token = await signJwt(payload, SECRET, 1800);
    const decoded = await verifyJwt(token, SECRET);
    expect(decoded.sub).toBe("admin");
    expect(decoded.role).toBe("admin");
    expect(decoded.typ).toBe("access");
    expect(decoded.jti).toBeDefined();
    expect(decoded.exp).toBeGreaterThan(decoded.iat);
  });

  it("rejects a token with wrong secret", async () => {
    const token = await signJwt({ sub: "admin", role: "admin", typ: "access" }, SECRET, 1800);
    await expect(verifyJwt(token, "wrong-secret-that-is-also-32-chars")).rejects.toThrow();
  });

  it("rejects an expired token", async () => {
    const token = await signJwt({ sub: "admin", role: "admin", typ: "access" }, SECRET, -1);
    await expect(verifyJwt(token, SECRET)).rejects.toThrow("expired");
  });

  it("generates unique JTIs", () => {
    const a = generateJti();
    const b = generateJti();
    expect(a).not.toBe(b);
    expect(a.length).toBe(32);
  });
});
