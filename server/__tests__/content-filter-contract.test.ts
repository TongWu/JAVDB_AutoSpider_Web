import { describe, it, expect } from "vitest";
import { VALID_RULE_MODES, VALUE_REQUIRED } from "../contract/sql-contract.gen";

describe("ADR-055 generated content-filter allow-lists", () => {
  it("VALID_RULE_MODES gates representative pairs", () => {
    expect(VALID_RULE_MODES.has("actor:exclude")).toBe(true);
    expect(VALID_RULE_MODES.has("gender:exclude_all_male")).toBe(true);
    expect(VALID_RULE_MODES.has("actor:require_lead")).toBe(false);
    expect(VALID_RULE_MODES.size).toBe(13);
  });

  it("VALUE_REQUIRED excludes the no-value pair", () => {
    expect(VALUE_REQUIRED.has("gender:exclude_all_male")).toBe(false);
    expect(VALUE_REQUIRED.has("gender:require_lead")).toBe(true);
    expect(VALUE_REQUIRED.size).toBe(12);
  });
});
