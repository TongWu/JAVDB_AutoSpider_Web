import { describe, it, expect } from "vitest";
import { getWorkflowSchema, WORKFLOW_REGISTRY, validateWorkflowInputs } from "../services/workflow-registry";

describe("workflow-registry", () => {
  it("contains 5 registered workflows", () => {
    expect(WORKFLOW_REGISTRY.size).toBe(5);
  });

  it("returns schema for WeeklyDedup.yml", () => {
    const schema = getWorkflowSchema("WeeklyDedup.yml");
    expect(schema).toBeDefined();
    expect(schema!.displayName).toBe("Weekly Dedup");
    expect(schema!.params.length).toBe(8);
    expect(schema!.safetyGate).toBeDefined();
    expect(schema!.safetyGate!.field).toBe("confirm_production");
  });

  it("returns schema for Migration.yml", () => {
    const schema = getWorkflowSchema("Migration.yml");
    expect(schema).toBeDefined();
    expect(schema!.params.length).toBeGreaterThanOrEqual(15);
    expect(schema!.safetyGate).toBeDefined();
  });

  it("returns schema for TestIngestion.yml", () => {
    const schema = getWorkflowSchema("TestIngestion.yml");
    expect(schema).toBeDefined();
    expect(schema!.params.length).toBe(2);
    expect(schema!.safetyGate).toBeUndefined();
  });

  it("returns schema for RollbackD1.yml", () => {
    const schema = getWorkflowSchema("RollbackD1.yml");
    expect(schema).toBeDefined();
    expect(schema!.params.length).toBe(10);
    expect(schema!.safetyGate).toBeDefined();
  });

  it("returns undefined for unknown workflow", () => {
    expect(getWorkflowSchema("NotReal.yml")).toBeUndefined();
  });

  it("every param has required fields", () => {
    for (const [name, entry] of WORKFLOW_REGISTRY) {
      for (const param of entry.params) {
        expect(param.name, `${name}/${param.name}`).toBeTruthy();
        expect(param.type, `${name}/${param.name}`).toMatch(/^(string|boolean|choice)$/);
        expect(typeof param.required, `${name}/${param.name}`).toBe("boolean");
      }
    }
  });

  it("choice params have choices array", () => {
    for (const [name, entry] of WORKFLOW_REGISTRY) {
      for (const param of entry.params) {
        if (param.type === "choice") {
          expect(param.choices, `${name}/${param.name}`).toBeDefined();
          expect(param.choices!.length, `${name}/${param.name}`).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe("validateWorkflowInputs", () => {
  it("returns valid for unknown workflow (unregistered workflows skip validation)", () => {
    const result = validateWorkflowInputs("NotReal.yml", {});
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("detects missing required parameter", () => {
    const result = validateWorkflowInputs("RollbackD1.yml", {});
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("session_id");
  });

  it("treats an empty-string required parameter as missing", () => {
    const result = validateWorkflowInputs("RollbackD1.yml", { session_id: "" });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("session_id"))).toBe(true);
  });

  it("detects invalid choice value", () => {
    const result = validateWorkflowInputs("RollbackD1.yml", {
      session_id: "s1",
      scope: "bogus",
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/scope/);
    expect(result.errors[0]).toMatch(/bogus/);
  });

  it("accepts valid inputs with choice and required parameters", () => {
    const result = validateWorkflowInputs("RollbackD1.yml", {
      session_id: "s1",
      scope: "all",
      dry_run: "true",
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("does not trigger safety gate when dry_run is true (default)", () => {
    const result = validateWorkflowInputs("RollbackD1.yml", {
      session_id: "s1",
      dry_run: "true",
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("triggers safety gate when dry_run=false without confirm_production", () => {
    const result = validateWorkflowInputs("RollbackD1.yml", {
      session_id: "s1",
      dry_run: "false",
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/confirm_production.*I-UNDERSTAND/);
  });

  it("satisfies safety gate with correct confirm_production value", () => {
    const result = validateWorkflowInputs("RollbackD1.yml", {
      session_id: "s1",
      dry_run: "false",
      confirm_production: "I-UNDERSTAND",
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("triggers safety gate when force=true without confirm_production", () => {
    const result = validateWorkflowInputs("RollbackD1.yml", {
      session_id: "s1",
      force: "true",
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/confirm_production.*I-UNDERSTAND/);
  });

  it("satisfies safety gate with force=true and confirm_production", () => {
    const result = validateWorkflowInputs("RollbackD1.yml", {
      session_id: "s1",
      force: "true",
      confirm_production: "I-UNDERSTAND",
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("triggers WeeklyDedup safety gate when dry_run=false", () => {
    const result = validateWorkflowInputs("WeeklyDedup.yml", {
      dry_run: "false",
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/confirm_production.*I-UNDERSTAND/);
  });

  it("satisfies WeeklyDedup safety gate with confirm_production", () => {
    const result = validateWorkflowInputs("WeeklyDedup.yml", {
      dry_run: "false",
      confirm_production: "I-UNDERSTAND",
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("does not validate TestIngestion (no safety gate)", () => {
    const result = validateWorkflowInputs("TestIngestion.yml", {});
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("accepts partial inputs for optional parameters", () => {
    const result = validateWorkflowInputs("RollbackD1.yml", {
      session_id: "s1",
      scope: "reports",
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("validates choice correctly with multiple choices", () => {
    const result = validateWorkflowInputs("RollbackD1.yml", {
      session_id: "s1",
      scope: "history",
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});
