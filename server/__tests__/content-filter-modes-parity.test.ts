import { describe, it, expect } from "vitest";
import { VALID_RULE_MODES, VALUE_REQUIRED } from "../routes/content-filter";

// MUST be set-identical to the MAIN repo's
// tests/unit/test_content_filter_modes_parity.py CANONICAL_* sets. The CLI tuples
// (apps/cli/ops/content_filter.py) are the single source of truth; if this fails,
// fix whichever side drifted, never the test.
const CANONICAL_VALID = [
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
];
const CANONICAL_VALUE_REQUIRED = [
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
];

const sorted = (s: Set<string>) => [...s].sort();

describe("Content-filter allow-list parity", () => {
  it("TS VALID_RULE_MODES matches the canonical cross-backend set", () => {
    expect(sorted(VALID_RULE_MODES)).toEqual([...CANONICAL_VALID].sort());
  });
  it("TS VALUE_REQUIRED matches the canonical cross-backend set", () => {
    expect(sorted(VALUE_REQUIRED)).toEqual([...CANONICAL_VALUE_REQUIRED].sort());
  });
});
