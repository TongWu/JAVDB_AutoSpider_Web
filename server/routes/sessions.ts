import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";
import type { JwtPayload } from "../services/jwt";
import { requireRole } from "../middleware/auth";
import { createGhClient } from "../services/gh-client";

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

function cursorEncode(sessionId: string): string {
  return btoa(JSON.stringify({ sid: sessionId }));
}

function cursorDecode(cursor: string): string {
  try {
    const parsed = JSON.parse(atob(cursor));
    return parsed.sid;
  } catch {
    throw new HTTPException(400, { message: "Invalid cursor" });
  }
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
    bindings.push(cursorDecode(cursor));
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
  const nextCursor = items.length === limit && lastItem ? cursorEncode(lastItem.session_id) : null;

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

  // Already committed and force not set → 409
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

  // Update session status
  await c.env.REPORTS_DB
    .prepare(
      "UPDATE ReportSessions SET Status = 'committed', DateTimeCreated = COALESCE(DateTimeCreated, datetime('now')) WHERE Id = ?"
    )
    .bind(sessionId)
    .run();

  let pendingDropped = 0;

  if (body.drop_pending) {
    // Delete from PendingMovieHistoryWrites — catch if table doesn't exist
    try {
      const movieResult = await c.env.HISTORY_DB
        .prepare("DELETE FROM PendingMovieHistoryWrites WHERE SessionId = ?")
        .bind(sessionId)
        .run();
      pendingDropped += movieResult.meta.changes ?? 0;
    } catch {
      // Table may not exist — that's fine
    }

    // Delete from PendingTorrentHistoryWrites — catch if table doesn't exist
    try {
      const torrentResult = await c.env.HISTORY_DB
        .prepare("DELETE FROM PendingTorrentHistoryWrites WHERE SessionId = ?")
        .bind(sessionId)
        .run();
      pendingDropped += torrentResult.meta.changes ?? 0;
    } catch {
      // Table may not exist — that's fine
    }
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
    dry_run?: boolean;
    include_pending?: boolean;
  }>().catch(() => ({} as Record<string, never>));

  // Validate session exists
  const session = await c.env.REPORTS_DB
    .prepare("SELECT Id FROM ReportSessions WHERE Id = ?")
    .bind(sessionId)
    .first<{ Id: string }>();

  if (!session) {
    throw new HTTPException(404, {
      message: JSON.stringify({ error: { code: "session.not_found" } }),
    });
  }

  if (body.dry_run) {
    return c.json({
      session_id: sessionId,
      dry_run: true,
      actions: [{ type: "preview", message: "Would dispatch RollbackD1.yml" }],
      summary: { dispatched: false },
    });
  }

  // Real rollback — require GH Actions
  if (!isGhActionsConfigured(c.env)) {
    throw new HTTPException(503, {
      message: "GitHub Actions not configured",
    });
  }

  const gh = createGhClient({
    token: c.env.GH_ACTIONS_TOKEN!,
    repo: c.env.GH_ACTIONS_REPO!,
  });
  await gh.dispatchWorkflow("RollbackD1.yml", { session_id: sessionId });

  return c.json({
    session_id: sessionId,
    dry_run: false,
    actions: [{ type: "dispatched", workflow: "RollbackD1.yml" }],
    summary: { dispatched: true },
  });
});
