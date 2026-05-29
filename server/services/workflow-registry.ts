export interface WorkflowParam {
  name: string;
  type: "string" | "boolean" | "choice";
  required: boolean;
  default?: string | boolean;
  choices?: string[];
  description?: string;
}

export interface WorkflowEntry {
  filename: string;
  displayName: string;
  description: string;
  category: "ingestion" | "maintenance" | "migration" | "monitoring";
  params: WorkflowParam[];
  safetyGate?: {
    field: string;
    requiredValue: string;
    triggerWhen: Record<string, unknown>;
  };
}

export const WORKFLOW_REGISTRY = new Map<string, WorkflowEntry>();

WORKFLOW_REGISTRY.set("WeeklyDedup.yml", {
  filename: "WeeklyDedup.yml",
  displayName: "Weekly Dedup",
  description: "Rclone deduplication scan — detects and optionally removes duplicate files",
  category: "maintenance",
  params: [
    { name: "runner", type: "choice", required: false, default: "self-hosted", choices: ["ubuntu-latest", "self-hosted"] },
    { name: "root_path", type: "string", required: false, default: "gdrive:/剧集/不可以色色/JAV-Sync", description: "Rclone remote path" },
    { name: "dry_run", type: "boolean", required: false, default: true },
    { name: "confirm_production", type: "string", required: false, default: "", description: 'Type "I-UNDERSTAND" for non-dry-run' },
    { name: "incremental", type: "boolean", required: false, default: false },
    { name: "years", type: "string", required: false, default: "", description: "Comma-separated years list" },
    { name: "workers", type: "string", required: false, default: "4", description: "Number of parallel workers" },
    { name: "log_level", type: "choice", required: false, default: "INFO", choices: ["DEBUG", "INFO", "WARNING", "ERROR"] },
  ],
  safetyGate: {
    field: "confirm_production",
    requiredValue: "I-UNDERSTAND",
    triggerWhen: { dry_run: false },
  },
});

WORKFLOW_REGISTRY.set("Migration.yml", {
  filename: "Migration.yml",
  displayName: "Migration",
  description: "Database migration runner — schema updates, backfills, and inventory alignment",
  category: "migration",
  params: [
    { name: "dry_run", type: "boolean", required: false, default: true },
    { name: "confirm_production", type: "string", required: false, default: "", description: 'Type "I-UNDERSTAND" for non-dry-run' },
    { name: "backup", type: "boolean", required: false, default: false },
    { name: "verify", type: "boolean", required: false, default: false },
    { name: "skip_schema", type: "boolean", required: false, default: false },
    { name: "normalize_datetimes", type: "boolean", required: false, default: false },
    { name: "backfill_actors", type: "boolean", required: false, default: false },
    { name: "align_inventory_history", type: "boolean", required: false, default: false },
    { name: "backfill_limit", type: "string", required: false, default: "0", description: "Max rows to process (0 = all)" },
    { name: "no_proxy", type: "boolean", required: false, default: false },
    { name: "use_cf_bypass", type: "boolean", required: false, default: false },
    { name: "align_limit_per_worker", type: "string", required: false, default: "0", description: "Max missing codes per worker (0 = all)" },
    { name: "align_codes", type: "string", required: false, default: "", description: "Comma-separated video codes override" },
    { name: "align_no_proxy", type: "boolean", required: false, default: false },
    { name: "align_no_login", type: "boolean", required: false, default: false },
    { name: "align_shuffle", type: "boolean", required: false, default: true },
    { name: "align_enqueue_qb", type: "boolean", required: false, default: true },
    { name: "align_execute_delete", type: "boolean", required: false, default: false },
    { name: "align_qb_category", type: "string", required: false, default: "", description: "qBittorrent category override" },
    { name: "runner", type: "choice", required: false, default: "self-hosted", choices: ["ubuntu-latest", "self-hosted"] },
  ],
  safetyGate: {
    field: "confirm_production",
    requiredValue: "I-UNDERSTAND",
    triggerWhen: { dry_run: false },
  },
});

WORKFLOW_REGISTRY.set("TestIngestion.yml", {
  filename: "TestIngestion.yml",
  displayName: "Test Ingestion",
  description: "Test pipeline run with dry-run mode — validates spider and pipeline execution",
  category: "ingestion",
  params: [
    { name: "runner", type: "choice", required: false, default: "ubuntu-latest", choices: ["ubuntu-latest", "self-hosted"] },
    { name: "proxy_spider", type: "boolean", required: false, default: true, description: "Enable proxy for Spider requests" },
  ],
});

WORKFLOW_REGISTRY.set("RollbackD1.yml", {
  filename: "RollbackD1.yml",
  displayName: "Rollback D1",
  description: "Rollback a session — reverts history and report data for a specific session",
  category: "maintenance",
  params: [
    { name: "session_id", type: "string", required: true, description: "ReportSessions.Id to rollback" },
    { name: "run_id", type: "string", required: false, default: "", description: "GitHub run id for audit trail" },
    { name: "attempt", type: "string", required: false, default: "", description: "GitHub run attempt number" },
    { name: "run_started_at", type: "string", required: false, default: "", description: "ISO timestamp lower bound" },
    { name: "scope", type: "choice", required: false, default: "all", choices: ["all", "reports", "operations", "history"] },
    { name: "dry_run", type: "boolean", required: false, default: true },
    { name: "force", type: "boolean", required: false, default: false, description: "Allow rollback of committed sessions" },
    { name: "log_level", type: "choice", required: false, default: "INFO", choices: ["DEBUG", "INFO", "WARNING", "ERROR"] },
    { name: "runner", type: "choice", required: false, default: "self-hosted", choices: ["ubuntu-latest", "self-hosted"] },
    { name: "confirm_production", type: "string", required: false, default: "", description: 'Type "I-UNDERSTAND" for non-dry-run or force' },
  ],
  safetyGate: {
    field: "confirm_production",
    requiredValue: "I-UNDERSTAND",
    triggerWhen: { dry_run: false },
  },
});

WORKFLOW_REGISTRY.set("StaleSessionCleanup.yml", {
  filename: "StaleSessionCleanup.yml",
  displayName: "Stale Session Cleanup",
  description: "Clean up sessions stuck in non-terminal states beyond a max age (dry-run by default)",
  category: "maintenance",
  params: [
    { name: "max_age_hours", type: "string", required: false, default: "48", description: "Sessions older than this many hours are eligible" },
    { name: "apply", type: "boolean", required: false, default: false, description: "Apply cleanup (default dry-run)" },
    { name: "scope", type: "choice", required: false, default: "all", choices: ["all", "reports", "operations", "history"] },
    { name: "log_level", type: "choice", required: false, default: "INFO", choices: ["DEBUG", "INFO", "WARNING", "ERROR"] },
    { name: "runner", type: "choice", required: false, default: "self-hosted", choices: ["ubuntu-latest", "self-hosted"] },
  ],
});

export function getWorkflowSchema(filename: string): WorkflowEntry | undefined {
  return WORKFLOW_REGISTRY.get(filename);
}

export function validateWorkflowInputs(
  filename: string,
  inputs: Record<string, string>,
): { valid: boolean; errors: string[] } {
  const schema = WORKFLOW_REGISTRY.get(filename);
  // Unregistered workflows are not validated here (advisory only); the dispatch
  // handler is responsible for restricting WHICH workflows may be dispatched.
  if (!schema) return { valid: true, errors: [] };

  const errors: string[] = [];

  for (const param of schema.params) {
    if (param.required && (!(param.name in inputs) || String(inputs[param.name]).trim() === "")) {
      errors.push(`Missing required parameter: ${param.name}`);
    }
    if (param.type === "choice" && param.name in inputs && param.choices) {
      if (!param.choices.includes(inputs[param.name])) {
        errors.push(`Invalid value for ${param.name}: '${inputs[param.name]}'. Allowed: ${param.choices.join(", ")}`);
      }
    }
  }

  if (schema.safetyGate) {
    const gate = schema.safetyGate;
    let gateTriggered = false;
    for (const [key, value] of Object.entries(gate.triggerWhen)) {
      if (inputs[key] === String(value)) {
        gateTriggered = true;
        break;
      }
    }
    if (inputs.force === "true") {
      gateTriggered = true;
    }
    if (gateTriggered && inputs[gate.field] !== gate.requiredValue) {
      errors.push(`Safety gate: ${gate.field} must be "${gate.requiredValue}" when ${Object.entries(gate.triggerWhen).map(([k, v]) => `${k}=${v}`).join(" or ")} (or force=true)`);
    }
  }

  return { valid: errors.length === 0, errors };
}
