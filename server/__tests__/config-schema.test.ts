import { describe, it, expect } from "vitest";
import { CONFIG_META_FIELDS, SENSITIVE_KEYS, ALIAS_MAP } from "../services/config-schema";

describe("config-schema", () => {
  const fieldKeys = CONFIG_META_FIELDS.map((f) => f.key);

  it("contains all 26 new keys from ADR-030", () => {
    const requiredKeys = [
      "PAGE_START", "PAGE_END", "PHASE2_MIN_RATE", "PHASE2_MIN_COMMENTS", "BASE_URL",
      "QB_URL_ADHOC", "QB_USERNAME_ADHOC", "QB_PASSWORD_ADHOC", "QB_ALLOW_INSECURE_HTTP",
      "REQUEST_TIMEOUT", "DELAY_BETWEEN_ADDITIONS",
      "SMTP_SERVER", "EMAIL_FROM", "EMAIL_TO",
      "PROXY_POOL_MAX_FAILURES", "LOGIN_PROXY_NAME",
      "GPT_API_URL", "GPT_API_KEY", "LOGIN_ATTEMPTS_PER_PROXY_LIMIT",
      "LOGIN_MAX_FAILURES_BEFORE_PROXY_SWITCH", "LOGIN_VERIFICATION_URLS",
      "GH_ACTIONS_TIER", "GH_ACTIONS_REPO", "GH_ACTIONS_TOKEN",
      "READONLY_USERNAME", "READONLY_PASSWORD_HASH",
    ];
    for (const key of requiredKeys) {
      expect(fieldKeys, `missing key: ${key}`).toContain(key);
    }
  });

  it("removed old key names that are now aliases", () => {
    expect(fieldKeys).not.toContain("START_PAGE");
    expect(fieldKeys).not.toContain("END_PAGE");
    expect(fieldKeys).not.toContain("SMTP_HOST");
  });

  it("marks sensitive keys correctly", () => {
    expect(SENSITIVE_KEYS.has("QB_PASSWORD_ADHOC")).toBe(true);
    expect(SENSITIVE_KEYS.has("GPT_API_KEY")).toBe(true);
    expect(SENSITIVE_KEYS.has("GH_ACTIONS_TOKEN")).toBe(true);
    expect(SENSITIVE_KEYS.has("READONLY_PASSWORD_HASH")).toBe(true);
  });

  it("marks readonly keys correctly", () => {
    const readonlyKeys = CONFIG_META_FIELDS.filter((f) => f.readonly);
    const readonlyNames = readonlyKeys.map((f) => f.key);
    expect(readonlyNames).toContain("QB_ALLOW_INSECURE_HTTP");
    expect(readonlyNames).toContain("GH_ACTIONS_TIER");
    expect(readonlyNames).toContain("GH_ACTIONS_REPO");
  });

  it("defines alias map with 3 entries", () => {
    expect(ALIAS_MAP).toEqual({
      SMTP_SERVER: "SMTP_HOST",
      PAGE_START: "START_PAGE",
      PAGE_END: "END_PAGE",
    });
  });

  it("has no duplicate keys", () => {
    const seen = new Set<string>();
    for (const key of fieldKeys) {
      expect(seen.has(key), `duplicate key: ${key}`).toBe(false);
      seen.add(key);
    }
  });

  it("GPT_API_KEY section is javdb, not advanced", () => {
    const field = CONFIG_META_FIELDS.find((f) => f.key === "GPT_API_KEY");
    expect(field?.section).toBe("javdb");
  });
});
