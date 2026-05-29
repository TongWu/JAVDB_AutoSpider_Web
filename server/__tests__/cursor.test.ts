import { describe, it, expect } from "vitest";
import { cursorEncode, cursorDecode } from "../services/cursor";

describe("cursor", () => {
  it("round-trips a numeric id", () => {
    const encoded = cursorEncode({ id: 42 });
    const decoded = cursorDecode<{ id: number }>(encoded);
    expect(decoded.id).toBe(42);
  });

  it("round-trips a string id", () => {
    const encoded = cursorEncode({ sid: "20260524T120000Z-0001-0001" });
    const decoded = cursorDecode<{ sid: string }>(encoded);
    expect(decoded.sid).toBe("20260524T120000Z-0001-0001");
  });

  it("round-trips multiple fields", () => {
    const encoded = cursorEncode({ id: 100, sort: "desc" });
    const decoded = cursorDecode<{ id: number; sort: string }>(encoded);
    expect(decoded.id).toBe(100);
    expect(decoded.sort).toBe("desc");
  });

  it("throws on malformed cursor", () => {
    expect(() => cursorDecode("not-base64-json!!!")).toThrow();
  });

  it("throws on non-JSON base64", () => {
    const plainNumeric = btoa("12345");
    expect(() => cursorDecode(plainNumeric)).toThrow();
  });
});
