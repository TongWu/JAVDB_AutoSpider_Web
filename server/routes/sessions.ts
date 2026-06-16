import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";
import type { JwtPayload } from "../services/jwt";
import { requireRole } from "../middleware/auth";
import { createGhClient } from "../services/gh-client";
import { cursorEncode, cursorDecode } from "../services/cursor";
import { validateWorkflowInputs } from "../services/workflow-registry";
import { createJobRunsRepo } from "../services/job-runs";
import { REPORT_SESSION_COLUMNS } from "../contract/sql-contract.gen";

export { REPORT_SESSION_COLUMNS };

type SessEnv = { Bindings: Env; Variables: { user: JwtPayload } };

export const sessionsRoutes = new Hono<SessEnv>();

export interface SessionRow {
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

export function mapSession(row: SessionRow) {
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

// Input keys mirror the Python _build_session_query kwargs (decoded). Pinned by
// the ADR-018 query Contract Golden against Python _build_session_query.
export interface SessionQueryInput {
  state?: string;
  cursor_sid?: string;
  limit: number;
}

// Pure query assembler returning the full SQL + bindings. Branch order MUST
// match Python (state → cursor). The trailing bindings value is `limit + 1`:
// the over-fetch is part of the builder contract — the handler uses the extra
// row as a has-more lookahead (avoids a phantom next_cursor when the result
// count is an exact multiple of limit).
export function buildSessionQuery(input: SessionQueryInput): { sql: string; bindings: (string | number)[] } {
  const clauses: string[] = [];
  const bindings: (string | number)[] = [];

  if (input.state) {
    clauses.push("Status = ?");
    bindings.push(input.state);
  }
  if (input.cursor_sid) {
    clauses.push("Id < ?");
    bindings.push(input.cursor_sid);
  }

  const where = clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";
  const sql =
    "SELECT " +
    REPORT_SESSION_COLUMNS.join(", ") +
    " FROM ReportSessions" +
    where +
    " ORDER BY Id DESC LIMIT ?";
  bindings.push(input.limit + 1);
  return { sql, bindings };
}

sessionsRoutes.get("/", async (c) => {
  const state = c.req.query("state");
  const cursor = c.req.query("cursor");
  const limit = Math.max(1, Math.min(200, parseInt(c.req.query("limit") ?? "50", 10) || 50));

  const { sql, bindings } = buildSessionQuery({
    state: state || undefined,
    cursor_sid: cursor ? cursorDecode<{ sid: string }>(cursor).sid : undefined,
    limit,
  });

  const rows = await c.env.REPORTS_DB
    .prepare(sql)
    .bind(...bindings)
    .all<SessionRow>();

  // limit + 1 over-fetch: the extra row signals a next page exists.
  const hasMore = rows.results.length > limit;
  const items = rows.results.slice(0, limit).map(mapSession);
  const lastItem = items[items.length - 1];
  const nextCursor = hasMore && lastItem ? cursorEncode({ sid: lastItem.session_id }) : null;

  return c.json({ items, next_cursor: nextCursor });
});

sessionsRoutes.get("/:session_id", async (c) => {
  const sessionId = c.req.param("session_id");

  const session = await c.env.REPORTS_DB
    .prepare(`SELECT ${REPORT_SESSION_COLUMNS.join(", ")} FROM ReportSessions WHERE Id = ?`)
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

async function hasReportSessionsColumn(db: D1Database, columnName: string): Promise<boolean> {
  const columns = await db
    .prepare("PRAGMA table_info(ReportSessions)")
    .all<{ name: string }>();
  return columns.results.some((column) => column.name === columnName);
}

function isDuplicateColumnError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return /duplicate column name|column .*already exists|already exists.*column/i.test(err.message);
}

export async function ensureReportSessionsCommittedAtColumn(db: D1Database): Promise<void> {
  if (await hasReportSessionsColumn(db, "CommittedAt")) return;

  try {
    await db.prepare("ALTER TABLE ReportSessions ADD COLUMN CommittedAt TEXT").run();
  } catch (err) {
    if (isDuplicateColumnError(err) && await hasReportSessionsColumn(db, "CommittedAt")) return;
    throw err;
  }
}

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
    } catch (err) {
      // Only ignore "table doesn't exist" (fresh/test DBs). Rethrow any other
      // error so we don't commit the session with pending rows left undeleted.
      if (!(err instanceof Error && /no such table/i.test(err.message))) throw err;
    }
  }

  // Step 2: Update session status
  try {
    await ensureReportSessionsCommittedAtColumn(c.env.REPORTS_DB);
    await c.env.REPORTS_DB
      .prepare(
        [
          "UPDATE ReportSessions",
          "SET Status = 'committed',",
          "DateTimeCreated = COALESCE(DateTimeCreated, datetime('now')),",
          "CommittedAt = COALESCE(CommittedAt, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) WHERE Id = ?",
        ].join(" ")
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
