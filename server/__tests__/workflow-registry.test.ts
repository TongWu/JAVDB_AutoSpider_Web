import { describe, it, expect } from "vitest";
import { getWorkflowSchema, WORKFLOW_REGISTRY, type WorkflowEntry } from "../services/workflow-registry";

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
