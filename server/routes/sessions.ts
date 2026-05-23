import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";
import type { JwtPayload } from "../services/jwt";

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
  const nextCursor = items.length === limit && lastItem ? cursorEncode(lastItem.session_id) : undefined;

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
