import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";
import type { JwtPayload } from "../services/jwt";
import { requireRole } from "../middleware/auth";
import { createGhClient } from "../services/gh-client";
import { cursorEncode, cursorDecode } from "../services/cursor";
import { validateWorkflowInputs } from "../services/workflow-registry";
import { createJobRunsRepo } from "../services/job-runs";

type SessEnv = { Bindings: Env; Variables: { user: JwtPayload } };

export const sessionsRoutes = new Hono<SessEnv>();

interface SessionRow {
  Id: string;
  Status: string | null;
  WriteMode: string | null;
  RunId: string | null;
  RunAttempt: number | null;
  DateTimeCreated: string;
  ReportType: string;
  ReportDate: string;
  FailureReason: string | null;
}

function mapSession(row: SessionRow) {
  return {
    session_id: row.Id,
    state: row.Status ?? "in_progress",
    write_mode: row.WriteMode ?? "pending",
    run_id: row.RunId ?? null,
    run_attempt: row.RunAttempt ?? null,
    created_at: row.DateTimeCreated,
    report_type: row.ReportType,
    report_date: row.ReportDate,
    failure_reason: row.FailureReason ?? null,
  };
}

sessionsRoutes.get("/", async (c) => {
  const state = c.req.query("state");
  const cursor = c.req.query("cursor");
  const limit = Math.max(1, Math.min(200, parseInt(c.req.query("limit") ?? "50", 10) || 50));

  const conditions: string[] = [];
  const bindings: (string | number)[] = [];

  if (state) {
    conditions.push("Status = ?");
    bindings.push(state);
  }
  if (cursor) {
    conditions.push("Id < ?");
    bindings.push(cursorDecode<{ sid: string }>(cursor).sid);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const sql = `
    SELECT Id, Status, WriteMode, RunId, RunAttempt, DateTimeCreated,
           ReportType, ReportDate, FailureReason
    FROM ReportSessions
    ${where}
    ORDER BY Id DESC
    LIMIT ?`;

  const rows = await c.env.REPORTS_DB
    .prepare(sql)
    .bind(...bindings, limit)
    .all<SessionRow>();

  const items = rows.results.map(mapSession);
  const lastItem = items[items.length - 1];
  const nextCursor = items.length === limit && lastItem ? cursorEncode({ sid: lastItem.session_id }) : null;

  return c.json({ items, next_cursor: nextCursor });
});

sessionsRoutes.get("/:session_id", async (c) => {
  const sessionId = c.req.param("session_id");

  const session = await c.env.REPORTS_DB
    .prepare(
      `SELECT Id, Status, WriteMode, RunId, RunAttempt, DateTimeCreated,
              ReportType, ReportDate, FailureReason
       FROM ReportSessions WHERE Id = ?`
    )
    .bind(sessionId)
    .first<SessionRow>();

  if (!session) {
    throw new HTTPException(404, {
      message: JSON.stringify({ error: { code: "session.not_found" } }),
    });
  }

  const movies = await c.env.REPORTS_DB
    .prepare("SELECT * FROM ReportMovies WHERE SessionId = ?")
    .bind(sessionId)
    .all();

  const torrents = await c.env.REPORTS_DB
    .prepare(
      `SELECT t.* FROM ReportTorrents t
       JOIN ReportMovies m ON m.Id = t.ReportMovieId
       WHERE m.SessionId = ?`
    )
    .bind(sessionId)
    .all();

  return c.json({
    session: mapSession(session),
    movies: movies.results,
    torrents: torrents.results,
  });
});

// ---------- helpers for commit / rollback ----------

function isGhActionsConfigured(env: Env): boolean {
  return (
    !!env.GH_ACTIONS_TIER &&
    env.GH_ACTIONS_TIER !== "none" &&
    !!env.GH_ACTIONS_TOKEN &&
    !!env.GH_ACTIONS_REPO
  );
}

const COMMITTABLE_STATES = new Set(["in_progress", "finalizing"]);

// POST /:session_id/commit — commit a session
sessionsRoutes.post("/:session_id/commit", requireRole("admin"), async (c) => {
  const sessionId = c.req.param("session_id");

  const body = await c.req.json<{
    force?: boolean;
    drop_pending?: boolean;
    emit_metrics?: boolean;
    fanout_claims?: boolean;
  }>().catch(() => ({} as Record<string, never>));

  const session = await c.env.REPORTS_DB
    .prepare("SELECT Id, Status FROM ReportSessions WHERE Id = ?")
    .bind(sessionId)
    .first<{ Id: string; Status: string | null }>();

  if (!session) {
    throw new HTTPException(404, {
      message: JSON.stringify({ error: { code: "session.not_found" } }),
    });
  }

  const currentState = session.Status ?? "in_progress";

  if (!COMMITTABLE_STATES.has(currentState)) {
    if (!(currentState === "committed" && body.force)) {
      throw new HTTPException(409, {
        message: JSON.stringify({
          error: {
            code: "session.invalid_state",
            detail: `Cannot commit session in state '${currentState}'`,
          },
        }),
      });
    }
  }

  let pendingDropped = 0;

  // Step 1: Delete pending writes FIRST (recoverable if step 2 fails)
  if (body.drop_pending) {
    try {
      const stmts = [
        c.env.HISTORY_DB.prepare("DELETE FROM PendingMovieHistoryWrites WHERE SessionId = ?").bind(sessionId),
        c.env.HISTORY_DB.prepare("DELETE FROM PendingTorrentHistoryWrites WHERE SessionId = ?").bind(sessionId),
      ];
      const results = await c.env.HISTORY_DB.batch(stmts);
      for (const r of results) {
        pendingDropped += r.meta.changes ?? 0;
      }
    } catch {
      // Tables may not exist — that's fine
    }
  }

  // Step 2: Update session status
  try {
    await c.env.REPORTS_DB
      .prepare(
        "UPDATE ReportSessions SET Status = 'committed', DateTimeCreated = COALESCE(DateTimeCreated, datetime('now')) WHERE Id = ?"
      )
      .bind(sessionId)
      .run();
  } catch {
    // Partial failure: pending deleted but status not updated
    return c.json({
      session_id: sessionId,
      new_state: currentState,
      pending_dropped: pendingDropped,
      partial_failure: true,
      error: "Status update failed after pending deletion. Retry commit to complete.",
    }, 207);
  }

  return c.json({
    session_id: sessionId,
    new_state: "committed",
    pending_dropped: pendingDropped,
  });
});

// POST /:session_id/rollback — rollback a session (dispatches GH Actions workflow)
sessionsRoutes.post("/:session_id/rollback", requireRole("admin"), async (c) => {
  const sessionId = c.req.param("session_id");

  const body = await c.req.json<{
    scope?: string;
    force?: boolean;
    dry_run?: boolean;
    confirm_production?: string;
    log_level?: string;
    runner?: string;
  }>().catch(() => ({} as Record<string, never>));

  const session = await c.env.REPORTS_DB
    .prepare("SELECT Id FROM ReportSessions WHERE Id = ?")
    .bind(sessionId)
    .first<{ Id: string }>();

  if (!session) {
    throw new HTTPException(404, {
      message: JSON.stringify({ error: { code: "session.not_found" } }),
    });
  }

  const inputs: Record<string, string> = {
    session_id: sessionId,
    scope: body.scope ?? "all",
    dry_run: String(body.dry_run ?? true),
    force: String(body.force ?? false),
    confirm_production: body.confirm_production ?? "",
    log_level: body.log_level ?? "INFO",
    runner: body.runner ?? "self-hosted",
  };

  const validation = validateWorkflowInputs("RollbackD1.yml", inputs);
  if (!validation.valid) {
    throw new HTTPException(422, {
      message: JSON.stringify({
        error: {
          code: "rollback.invalid_inputs",
          message: "Rollback validation failed",
          details: validation.errors,
        },
      }),
    });
  }

  if (!isGhActionsConfigured(c.env)) {
    throw new HTTPException(503, {
      message: "GitHub Actions not configured",
    });
  }

  const gh = createGhClient({
    token: c.env.GH_ACTIONS_TOKEN!,
    repo: c.env.GH_ACTIONS_REPO!,
  });
  await gh.dispatchWorkflow("RollbackD1.yml", inputs);

  const repo = createJobRunsRepo(c.env.OPERATIONS_DB);
  const job = await repo.create("rollback", "RollbackD1.yml", inputs);

  return c.json({
    session_id: sessionId,
    dry_run: inputs.dry_run === "true",
    job_id: job.job_id,
    actions: [{ type: "dispatched", workflow: "RollbackD1.yml", inputs }],
    summary: { dispatched: true },
  });
});
