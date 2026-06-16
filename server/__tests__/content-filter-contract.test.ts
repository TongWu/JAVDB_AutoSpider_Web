import { describe, it, expect } from "vitest";
import { VALID_RULE_MODES, VALUE_REQUIRED } from "../contract/sql-contract.gen";

describe("ADR-055 generated content-filter allow-lists", () => {
  it("VALID_RULE_MODES pins exact rule-mode membership", () => {
    expect(VALID_RULE_MODES).toEqual(new Set([
      "actor:exclude",
      "tag:exclude",
      "tag:include",
      "gender:require_lead",
      "gender:exclude_all_male",
      "age:min_age",
      "age:max_age",
      "actor:regex_exclude",
      "actor:regex_include",
      "tag:regex_exclude",
      "tag:regex_include",
      "release_date:before",
      "release_date:after",
    ]));
  });

  it("VALUE_REQUIRED pins exact value-required membership", () => {
    expect(VALUE_REQUIRED).toEqual(new Set([
      "actor:exclude",
      "tag:exclude",
      "tag:include",
      "gender:require_lead",
      "age:min_age",
      "age:max_age",
      "actor:regex_exclude",
      "actor:regex_include",
      "tag:regex_exclude",
      "tag:regex_include",
      "release_date:before",
      "release_date:after",
    ]));
  });
});
