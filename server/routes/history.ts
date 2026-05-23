import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";
import type { JwtPayload } from "../services/jwt";

type HistEnv = { Bindings: Env; Variables: { user: JwtPayload } };

export const historyRoutes = new Hono<HistEnv>();

// --- Helpers ---

function cursorEncode(id: number): string {
  return btoa(String(id));
}

function cursorDecode(cursor: string): number {
  try {
    return parseInt(atob(cursor), 10);
  } catch {
    throw new HTTPException(400, {
      message: JSON.stringify({ error: { code: "history.invalid_cursor", message: "cursor is malformed" } }),
    });
  }
}

function normalizeDate(raw: string, isEnd: boolean): string | null {
  const cleaned = raw.replace("T", " ").replace("Z", "").trim();
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(cleaned);
  if (dateOnly) {
    return isEnd ? `${cleaned} 23:59:59` : `${cleaned} 00:00:00`;
  }
  const full = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(cleaned);
  if (full) return cleaned;
  return null;
}

function clampLimit(raw: string | undefined): number {
  const n = parseInt(raw ?? "50", 10);
  return Math.max(1, Math.min(200, isNaN(n) ? 50 : n));
}

// --- Movie search ---

interface MovieRow {
  Id: number;
  VideoCode: string;
  Href: string;
  ActorName: string | null;
  ActorGender: string | null;
  SupportingActors: string | null;
  PerfectMatchIndicator: number | null;
  HiResIndicator: number | null;
  DateTimeCreated: string | null;
  DateTimeUpdated: string | null;
  SessionId: string | null;
  torrent_count: number;
}

function buildMovieQuery(params: Record<string, string | undefined>, forExport: boolean) {
  const conditions: string[] = [];
  const bindings: (string | number)[] = [];

  if (params.cursor && !forExport) {
    conditions.push("m.Id > ?");
    bindings.push(cursorDecode(params.cursor));
  }
  if (params.q) {
    const like = `%${params.q}%`;
    conditions.push("(m.VideoCode LIKE ? OR m.ActorName LIKE ? OR m.SupportingActors LIKE ?)");
    bindings.push(like, like, like);
  }
  if (params.actor) {
    conditions.push("m.ActorName = ?");
    bindings.push(params.actor);
  }
  if (params.perfect_match !== undefined) {
    conditions.push("m.PerfectMatchIndicator = ?");
    bindings.push(params.perfect_match === "true" ? 1 : 0);
  }
  if (params.hi_res !== undefined) {
    conditions.push("m.HiResIndicator = ?");
    bindings.push(params.hi_res === "true" ? 1 : 0);
  }
  if (params.session_id) {
    conditions.push("m.SessionId = ?");
    bindings.push(params.session_id);
  }
  if (params.date_from) {
    const d = normalizeDate(params.date_from, false);
    if (!d) throw new HTTPException(400, {
      message: JSON.stringify({ error: { code: "history.invalid_date", message: "date_from could not be parsed" } }),
    });
    conditions.push("m.DateTimeCreated >= ?");
    bindings.push(d);
  }
  if (params.date_to) {
    const d = normalizeDate(params.date_to, true);
    if (!d) throw new HTTPException(400, {
      message: JSON.stringify({ error: { code: "history.invalid_date", message: "date_to could not be parsed" } }),
    });
    conditions.push("m.DateTimeCreated <= ?");
    bindings.push(d);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const selectSql = `
    SELECT m.Id, m.VideoCode, m.Href, m.ActorName, m.ActorGender,
           m.SupportingActors, m.PerfectMatchIndicator, m.HiResIndicator,
           m.DateTimeCreated, m.DateTimeUpdated, m.SessionId,
           COUNT(t.Id) AS torrent_count
    FROM MovieHistory m
    LEFT JOIN TorrentHistory t ON t.MovieHistoryId = m.Id
    ${where}
    GROUP BY m.Id
    ORDER BY m.Id`;

  const countSql = `SELECT COUNT(*) AS cnt FROM MovieHistory m ${where}`;

  return { selectSql, countSql, bindings };
}

historyRoutes.get("/movies", async (c) => {
  const params = c.req.query();
  const limit = clampLimit(params.limit);
  const { selectSql, countSql, bindings } = buildMovieQuery(params, false);

  const db = c.env.HISTORY_DB;
  const countResult = await db.prepare(countSql).bind(...bindings).first<{ cnt: number }>();
  const rows = await db.prepare(`${selectSql} LIMIT ?`).bind(...bindings, limit).all<MovieRow>();

  const items = rows.results.map((r) => ({
    id: r.Id,
    video_code: r.VideoCode,
    href: r.Href,
    actor_name: r.ActorName,
    actor_gender: r.ActorGender,
    supporting_actors: r.SupportingActors,
    perfect_match: r.PerfectMatchIndicator === 1,
    hi_res: r.HiResIndicator === 1,
    datetime_created: r.DateTimeCreated,
    datetime_updated: r.DateTimeUpdated,
    session_id: r.SessionId,
    torrent_count: r.torrent_count,
  }));

  const lastItem = items[items.length - 1];
  const nextCursor = items.length === limit && lastItem ? cursorEncode(lastItem.id) : undefined;

  return c.json({
    items,
    next_cursor: nextCursor,
    total_estimate: countResult?.cnt ?? 0,
  });
});

historyRoutes.get("/movies/export", async (c) => {
  const params = c.req.query();
  const { selectSql, bindings } = buildMovieQuery(params, true);
  const db = c.env.HISTORY_DB;
  const rows = await db.prepare(selectSql).bind(...bindings).all<MovieRow>();

  const header = "id,video_code,href,actor_name,actor_gender,supporting_actors,perfect_match,hi_res,datetime_created,datetime_updated,session_id,torrent_count";
  const csvRows = rows.results.map((r) =>
    [r.Id, r.VideoCode, r.Href, r.ActorName ?? "", r.ActorGender ?? "",
     r.SupportingActors ?? "", r.PerfectMatchIndicator ?? 0, r.HiResIndicator ?? 0,
     r.DateTimeCreated ?? "", r.DateTimeUpdated ?? "", r.SessionId ?? "", r.torrent_count]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",")
  );

  const csv = [header, ...csvRows].join("\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=movies.csv",
    },
  });
});

// --- Torrent search ---

interface TorrentRow {
  Id: number;
  movie_video_code: string | null;
  movie_href: string | null;
  MagnetUri: string | null;
  Size: string | null;
  SubtitleIndicator: number;
  CensorIndicator: number;
  ResolutionType: number;
  FileCount: number;
  DateTimeCreated: string | null;
  SessionId: string | null;
}

function buildTorrentQuery(params: Record<string, string | undefined>, forExport: boolean) {
  const conditions: string[] = [];
  const bindings: (string | number)[] = [];

  if (params.cursor && !forExport) {
    conditions.push("t.Id > ?");
    bindings.push(cursorDecode(params.cursor));
  }
  if (params.q) {
    conditions.push("m.VideoCode LIKE ?");
    bindings.push(`%${params.q}%`);
  }
  if (params.resolution_type !== undefined) {
    conditions.push("t.ResolutionType = ?");
    bindings.push(parseInt(params.resolution_type, 10));
  }
  if (params.has_subtitle !== undefined) {
    conditions.push("t.SubtitleIndicator = ?");
    bindings.push(params.has_subtitle === "true" ? 1 : 0);
  }
  if (params.uncensored !== undefined) {
    if (params.uncensored === "true") {
      conditions.push("t.CensorIndicator = 0");
    } else {
      conditions.push("t.CensorIndicator != 0");
    }
  }
  if (params.session_id) {
    conditions.push("t.SessionId = ?");
    bindings.push(params.session_id);
  }
  if (params.date_from) {
    const d = normalizeDate(params.date_from, false);
    if (!d) throw new HTTPException(400, {
      message: JSON.stringify({ error: { code: "history.invalid_date", message: "date_from could not be parsed" } }),
    });
    conditions.push("t.DateTimeCreated >= ?");
    bindings.push(d);
  }
  if (params.date_to) {
    const d = normalizeDate(params.date_to, true);
    if (!d) throw new HTTPException(400, {
      message: JSON.stringify({ error: { code: "history.invalid_date", message: "date_to could not be parsed" } }),
    });
    conditions.push("t.DateTimeCreated <= ?");
    bindings.push(d);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const selectSql = `
    SELECT t.Id, m.VideoCode AS movie_video_code, m.Href AS movie_href,
           t.MagnetUri, t.Size, t.SubtitleIndicator, t.CensorIndicator,
           t.ResolutionType, t.FileCount, t.DateTimeCreated, t.SessionId
    FROM TorrentHistory t
    JOIN MovieHistory m ON m.Id = t.MovieHistoryId
    ${where}
    ORDER BY t.Id`;

  const countSql = `
    SELECT COUNT(*) AS cnt
    FROM TorrentHistory t
    JOIN MovieHistory m ON m.Id = t.MovieHistoryId
    ${where}`;

  return { selectSql, countSql, bindings };
}

historyRoutes.get("/torrents", async (c) => {
  const params = c.req.query();
  const limit = clampLimit(params.limit);
  const { selectSql, countSql, bindings } = buildTorrentQuery(params, false);

  const db = c.env.HISTORY_DB;
  const countResult = await db.prepare(countSql).bind(...bindings).first<{ cnt: number }>();
  const rows = await db.prepare(`${selectSql} LIMIT ?`).bind(...bindings, limit).all<TorrentRow>();

  const items = rows.results.map((r) => ({
    id: r.Id,
    movie_video_code: r.movie_video_code,
    movie_href: r.movie_href,
    magnet_uri: r.MagnetUri,
    size: r.Size,
    subtitle_indicator: r.SubtitleIndicator,
    censor_indicator: r.CensorIndicator,
    resolution_type: r.ResolutionType,
    file_count: r.FileCount,
    datetime_created: r.DateTimeCreated,
    session_id: r.SessionId,
  }));

  const lastItem = items[items.length - 1];
  const nextCursor = items.length === limit && lastItem ? cursorEncode(lastItem.id) : undefined;

  return c.json({
    items,
    next_cursor: nextCursor,
    total_estimate: countResult?.cnt ?? 0,
  });
});

historyRoutes.get("/torrents/export", async (c) => {
  const params = c.req.query();
  const { selectSql, bindings } = buildTorrentQuery(params, true);
  const db = c.env.HISTORY_DB;
  const rows = await db.prepare(selectSql).bind(...bindings).all<TorrentRow>();

  const header = "id,movie_video_code,movie_href,magnet_uri,size,subtitle_indicator,censor_indicator,resolution_type,file_count,datetime_created,session_id";
  const csvRows = rows.results.map((r) =>
    [r.Id, r.movie_video_code ?? "", r.movie_href ?? "", r.MagnetUri ?? "",
     r.Size ?? "", r.SubtitleIndicator, r.CensorIndicator, r.ResolutionType,
     r.FileCount, r.DateTimeCreated ?? "", r.SessionId ?? ""]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",")
  );

  const csv = [header, ...csvRows].join("\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=torrents.csv",
    },
  });
});
