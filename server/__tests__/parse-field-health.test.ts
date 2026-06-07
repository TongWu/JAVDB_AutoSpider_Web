import { describe, it, expect } from "vitest";
import {
  computeFieldHealth,
  median,
  PARSE_CONTRACT,
  SENTINEL_MIN_SAMPLE,
  SENTINEL_BASELINE_WINDOW,
  type FieldFill,
  type ParseContract,
} from "../services/parse-field-health";

// Synthetic contract so the algorithm assertions don't depend on the exact
// production PARSE_CONTRACT floors (which mirror javdb/spider/parse_contract.py).
const CONTRACT: ParseContract = {
  index: {
    href: { severity: "critical", min_fill: 0.9 },
    rate: { severity: "soft", baseline_rel: 0.5 },
  },
};

function fill(over: Partial<FieldFill>): FieldFill {
  return {
    page_type: "index",
    field: "href",
    fill_rate: 1,
    sample_count: 100,
    observed_at: "2026-06-01T00:00:00Z",
    ...over,
  };
}

describe("median", () => {
  it("returns null for an empty list", () => {
    expect(median([])).toBeNull();
  });
  it("returns the middle value for an odd-length list", () => {
    expect(median([0.1, 0.9, 0.5])).toBe(0.5);
  });
  it("averages the two middle values for an even-length list", () => {
    expect(median([0.2, 0.4, 0.6, 0.8])).toBeCloseTo(0.5, 10);
  });
  it("is order-independent", () => {
    expect(median([0.9, 0.1, 0.5, 0.3, 0.7])).toBe(0.5);
  });
});

describe("computeFieldHealth", () => {
  it("critical field at/above min_fill ⇒ ok with threshold=min_fill, baseline=null", () => {
    const [item] = computeFieldHealth([fill({ fill_rate: 0.95 })], { contract: CONTRACT });
    expect(item.severity).toBe("critical");
    expect(item.status).toBe("ok");
    expect(item.threshold).toBe(0.9);
    expect(item.baseline).toBeNull();
  });

  it("critical field below min_fill ⇒ critical_drift", () => {
    const [item] = computeFieldHealth([fill({ fill_rate: 0.5 })], { contract: CONTRACT });
    expect(item.status).toBe("critical_drift");
    expect(item.threshold).toBe(0.9);
  });

  it("soft field at/above baseline_rel*baseline ⇒ ok with computed threshold", () => {
    const [item] = computeFieldHealth(
      [fill({ field: "rate", fill_rate: 0.6 })],
      { contract: CONTRACT, baselines: { index: { rate: 0.8 } } },
    );
    expect(item.severity).toBe("soft");
    expect(item.baseline).toBe(0.8);
    expect(item.threshold).toBeCloseTo(0.4, 10); // 0.5 * 0.8
    expect(item.status).toBe("ok");
  });

  it("soft field below baseline_rel*baseline ⇒ soft_drift", () => {
    const [item] = computeFieldHealth(
      [fill({ field: "rate", fill_rate: 0.3 })],
      { contract: CONTRACT, baselines: { index: { rate: 0.8 } } },
    );
    expect(item.status).toBe("soft_drift");
    expect(item.threshold).toBeCloseTo(0.4, 10);
  });

  it("soft field with no baseline ⇒ no_baseline (threshold=null)", () => {
    const [item] = computeFieldHealth(
      [fill({ field: "rate", fill_rate: 0.9 })],
      { contract: CONTRACT, baselines: { index: { rate: null } } },
    );
    expect(item.status).toBe("no_baseline");
    expect(item.baseline).toBeNull();
    expect(item.threshold).toBeNull();
  });

  it("sample_count below minSample ⇒ insufficient_sample (overrides drift)", () => {
    const [critical] = computeFieldHealth(
      [fill({ fill_rate: 0.1, sample_count: SENTINEL_MIN_SAMPLE - 1 })],
      { contract: CONTRACT },
    );
    expect(critical.status).toBe("insufficient_sample");

    const [soft] = computeFieldHealth(
      [fill({ field: "rate", fill_rate: 0.1, sample_count: 5 })],
      { contract: CONTRACT, baselines: { index: { rate: 0.8 } } },
    );
    expect(soft.status).toBe("insufficient_sample");
  });

  it("skips rows whose (page_type, field) is not in the contract", () => {
    const items = computeFieldHealth(
      [fill({ page_type: "index", field: "not_contracted" })],
      { contract: CONTRACT },
    );
    expect(items).toHaveLength(0);
  });

  it("emits the full openapi item shape", () => {
    const [item] = computeFieldHealth([fill({ fill_rate: 0.95 })], { contract: CONTRACT });
    expect(Object.keys(item).sort()).toEqual(
      [
        "baseline",
        "field",
        "fill_rate",
        "observed_at",
        "page_type",
        "sample_count",
        "severity",
        "status",
        "threshold",
      ].sort(),
    );
  });
});

describe("PARSE_CONTRACT (mirror of javdb/spider/parse_contract.py)", () => {
  it("marks index href/video_code/title critical", () => {
    expect(PARSE_CONTRACT.index.href.severity).toBe("critical");
    expect(PARSE_CONTRACT.index.video_code.severity).toBe("critical");
    expect(PARSE_CONTRACT.index.title.severity).toBe("critical");
  });

  it("marks index rate/comment_count/release_date soft with baseline_rel 0.5", () => {
    for (const f of ["rate", "comment_count", "release_date"] as const) {
      expect(PARSE_CONTRACT.index[f].severity).toBe("soft");
      expect(PARSE_CONTRACT.index[f].baseline_rel).toBe(0.5);
    }
  });

  it("uses sentinel defaults of 30 / 14", () => {
    expect(SENTINEL_MIN_SAMPLE).toBe(30);
    expect(SENTINEL_BASELINE_WINDOW).toBe(14);
  });
});
