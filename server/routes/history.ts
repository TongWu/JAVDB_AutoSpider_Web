import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";
import type { JwtPayload } from "../services/jwt";
import { cursorEncode, cursorDecode } from "../services/cursor";

type HistEnv = { Bindings: Env; Variables: { user: JwtPayload } };

export const historyRoutes = new Hono<HistEnv>();

// --- Helpers ---

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

// Input keys mirror the Python _build_movie_filters kwargs (decoded). Pinned
// by the ADR-018 query Contract Golden so the two backends cannot drift.
export interface MovieFilterInput {
  q?: string;
  actor?: string;
  perfect_match?: boolean;
  hi_res?: boolean;
  session_id?: string;
  date_from?: string;
  date_to?: string;
  cursor_id?: number;
}

// Pure WHERE-clause assembler. Branch order MUST match Python
// _build_movie_filters (cursor → q → actor → perfect_match → hi_res →
// session_id → date_from → date_to) so the joined string is byte-identical
// after normalization.
export function buildMovieWhere(input: MovieFilterInput): { where: string; bindings: (string | number)[] } {
  const conditions: string[] = [];
  const bindings: (string | number)[] = [];

  if (input.cursor_id !== undefined) {
    conditions.push("m.Id > ?");
    bindings.push(input.cursor_id);
  }
  if (input.q !== undefined) {
    const like = `%${input.q}%`;
    conditions.push("(m.VideoCode LIKE ? OR m.ActorName LIKE ? OR m.SupportingActors LIKE ?)");
    bindings.push(like, like, like);
  }
  if (input.actor !== undefined) {
    conditions.push("m.ActorName = ?");
    bindings.push(input.actor);
  }
  if (input.perfect_match !== undefined) {
    conditions.push("m.PerfectMatchIndicator = ?");
    bindings.push(input.perfect_match ? 1 : 0);
  }
  if (input.hi_res !== undefined) {
    conditions.push("m.HiResIndicator = ?");
    bindings.push(input.hi_res ? 1 : 0);
  }
  if (input.session_id !== undefined) {
    conditions.push("m.SessionId = ?");
    bindings.push(input.session_id);
  }
  if (input.date_from !== undefined) {
    const d = normalizeDate(input.date_from, false);
    if (!d) throw new HTTPException(400, {
      message: JSON.stringify({ error: { code: "history.invalid_date", message: "date_from could not be parsed" } }),
    });
    conditions.push("m.DateTimeCreated >= ?");
    bindings.push(d);
  }
  if (input.date_to !== undefined) {
    const d = normalizeDate(input.date_to, true);
    if (!d) throw new HTTPException(400, {
      message: JSON.stringify({ error: { code: "history.invalid_date", message: "date_to could not be parsed" } }),
    });
    conditions.push("m.DateTimeCreated <= ?");
    bindings.push(d);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return { where, bindings };
}

// Count assembler for the list view's `total_estimate`. Mirrors the Python
// movie_count contract: COUNT(*) capped at 10000 via MIN(...) so large tables
// short-circuit instead of scanning every row. Pinned by the ADR-018 query
// Contract Golden.
export function buildMovieCount(input: MovieFilterInput): { sql: string; bindings: (string | number)[] } {
  const { where, bindings } = buildMovieWhere(input);
  return { sql: `SELECT MIN(COUNT(*), 10000) AS cnt FROM MovieHistory m ${where}`, bindings };
}

function buildMovieQuery(params: Record<string, string | undefined>, forExport: boolean) {
  const input: MovieFilterInput = {
    cursor_id: params.cursor && !forExport ? cursorDecode<{ id: number }>(params.cursor).id : undefined,
    q: params.q || undefined,
    actor: params.actor || undefined,
    perfect_match: params.perfect_match !== undefined ? params.perfect_match === "true" : undefined,
    hi_res: params.hi_res !== undefined ? params.hi_res === "true" : undefined,
    session_id: params.session_id || undefined,
    date_from: params.date_from || undefined,
    date_to: params.date_to || undefined,
  };
  const { where, bindings } = buildMovieWhere(input);

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

  // List view uses the capped count (matches Python). Export needs the true
  // total for its truncation check against EXPORT_LIMIT, so it stays uncapped.
  const countSql = forExport
    ? `SELECT COUNT(*) AS cnt FROM MovieHistory m ${where}`
    : buildMovieCount(input).sql;

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
  const nextCursor = items.length === limit && lastItem ? cursorEncode({ id: lastItem.id }) : undefined;

  return c.json({
    items,
    next_cursor: nextCursor,
    total_estimate: countResult?.cnt ?? 0,
  });
});

const EXPORT_LIMIT = 100_000;

historyRoutes.get("/movies/export", async (c) => {
  const params = c.req.query();
  const { selectSql, countSql, bindings } = buildMovieQuery(params, true);
  const db = c.env.HISTORY_DB;

  const countResult = await db.prepare(countSql).bind(...bindings).first<{ cnt: number }>();
  const totalCount = countResult?.cnt ?? 0;
  const rows = await db.prepare(`${selectSql} LIMIT ${EXPORT_LIMIT}`).bind(...bindings).all<MovieRow>();
  const truncated = rows.results.length >= EXPORT_LIMIT && totalCount > EXPORT_LIMIT;

  const header = "id,video_code,href,actor_name,actor_gender,supporting_actors,perfect_match,hi_res,datetime_created,datetime_updated,session_id,torrent_count";
  const csvRows = rows.results.map((r) =>
    [r.Id, r.VideoCode, r.Href, r.ActorName ?? "", r.ActorGender ?? "",
     r.SupportingActors ?? "", r.PerfectMatchIndicator ?? 0, r.HiResIndicator ?? 0,
     r.DateTimeCreated ?? "", r.DateTimeUpdated ?? "", r.SessionId ?? "", r.torrent_count]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",")
  );

  const parts = ["﻿", header, "\n", csvRows.join("\n")];
  if (truncated) {
    parts.push(`\n# Export truncated at ${EXPORT_LIMIT} rows. Total: ${totalCount}`);
  }

  const responseHeaders: Record<string, string> = {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": "attachment; filename=movies.csv",
  };
  if (truncated) {
    responseHeaders["X-Export-Truncated"] = "true";
    responseHeaders["X-Export-Total-Count"] = String(totalCount);
  }

  const csv = parts.join("");
  // Encode to ensure BOM is preserved through Response transmission
  const encoded = new TextEncoder().encode(csv);
  return new Response(encoded, { headers: responseHeaders });
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

// Input keys mirror the Python _build_torrent_filters kwargs (decoded). Pinned
// by the ADR-018 query Contract Golden.
export interface TorrentFilterInput {
  q?: string;
  resolution_type?: number;
  has_subtitle?: boolean;
  uncensored?: boolean;
  session_id?: string;
  date_from?: string;
  date_to?: string;
  cursor_id?: number;
}

// Pure WHERE-clause assembler. Branch order MUST match Python
// _build_torrent_filters (cursor → q → resolution_type → has_subtitle →
// uncensored → session_id → date_from → date_to).
export function buildTorrentWhere(input: TorrentFilterInput): { where: string; bindings: (string | number)[] } {
  const conditions: string[] = [];
  const bindings: (string | number)[] = [];

  if (input.cursor_id !== undefined) {
    conditions.push("t.Id > ?");
    bindings.push(input.cursor_id);
  }
  if (input.q !== undefined) {
    conditions.push("m.VideoCode LIKE ?");
    bindings.push(`%${input.q}%`);
  }
  if (input.resolution_type !== undefined) {
    conditions.push("t.ResolutionType = ?");
    bindings.push(input.resolution_type);
  }
  if (input.has_subtitle !== undefined) {
    conditions.push("t.SubtitleIndicator = ?");
    bindings.push(input.has_subtitle ? 1 : 0);
  }
  if (input.uncensored !== undefined) {
    if (input.uncensored) {
      conditions.push("t.CensorIndicator = 0");
    } else {
      conditions.push("t.CensorIndicator != 0");
    }
  }
  if (input.session_id !== undefined) {
    conditions.push("t.SessionId = ?");
    bindings.push(input.session_id);
  }
  if (input.date_from !== undefined) {
    const d = normalizeDate(input.date_from, false);
    if (!d) throw new HTTPException(400, {
      message: JSON.stringify({ error: { code: "history.invalid_date", message: "date_from could not be parsed" } }),
    });
    conditions.push("t.DateTimeCreated >= ?");
    bindings.push(d);
  }
  if (input.date_to !== undefined) {
    const d = normalizeDate(input.date_to, true);
    if (!d) throw new HTTPException(400, {
      message: JSON.stringify({ error: { code: "history.invalid_date", message: "date_to could not be parsed" } }),
    });
    conditions.push("t.DateTimeCreated <= ?");
    bindings.push(d);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return { where, bindings };
}

// Count assembler for the list view's `total_estimate`. Mirrors the Python
// torrent_count contract: COUNT(*) capped at 10000 via MIN(...) so large tables
// short-circuit instead of scanning every row. Pinned by the ADR-018 query
// Contract Golden.
export function buildTorrentCount(input: TorrentFilterInput): { sql: string; bindings: (string | number)[] } {
  const { where, bindings } = buildTorrentWhere(input);
  return {
    sql: `SELECT MIN(COUNT(*), 10000) AS cnt FROM TorrentHistory t JOIN MovieHistory m ON m.Id = t.MovieHistoryId ${where}`,
    bindings,
  };
}

function buildTorrentQuery(params: Record<string, string | undefined>, forExport: boolean) {
  let resolutionType: number | undefined;
  if (params.resolution_type !== undefined) {
    resolutionType = parseInt(params.resolution_type, 10);
    if (Number.isNaN(resolutionType)) {
      throw new HTTPException(400, {
        message: JSON.stringify({ error: { code: "history.invalid_resolution_type", message: "resolution_type must be an integer" } }),
      });
    }
  }

  const input: TorrentFilterInput = {
    cursor_id: params.cursor && !forExport ? cursorDecode<{ id: number }>(params.cursor).id : undefined,
    q: params.q || undefined,
    resolution_type: resolutionType,
    has_subtitle: params.has_subtitle !== undefined ? params.has_subtitle === "true" : undefined,
    uncensored: params.uncensored !== undefined ? params.uncensored === "true" : undefined,
    session_id: params.session_id || undefined,
    date_from: params.date_from || undefined,
    date_to: params.date_to || undefined,
  };
  const { where, bindings } = buildTorrentWhere(input);

  const selectSql = `
    SELECT t.Id, m.VideoCode AS movie_video_code, m.Href AS movie_href,
           t.MagnetUri, t.Size, t.SubtitleIndicator, t.CensorIndicator,
           t.ResolutionType, t.FileCount, t.DateTimeCreated, t.SessionId
    FROM TorrentHistory t
    JOIN MovieHistory m ON m.Id = t.MovieHistoryId
    ${where}
    ORDER BY t.Id`;

  // List view uses the capped count (matches Python). Export needs the true
  // total for its truncation check against EXPORT_LIMIT, so it stays uncapped.
  const countSql = forExport
    ? `
    SELECT COUNT(*) AS cnt
    FROM TorrentHistory t
    JOIN MovieHistory m ON m.Id = t.MovieHistoryId
    ${where}`
    : buildTorrentCount(input).sql;

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
  const nextCursor = items.length === limit && lastItem ? cursorEncode({ id: lastItem.id }) : undefined;

  return c.json({
    items,
    next_cursor: nextCursor,
    total_estimate: countResult?.cnt ?? 0,
  });
});

historyRoutes.get("/torrents/export", async (c) => {
  const params = c.req.query();
  const { selectSql, countSql, bindings } = buildTorrentQuery(params, true);
  const db = c.env.HISTORY_DB;

  const countResult = await db.prepare(countSql).bind(...bindings).first<{ cnt: number }>();
  const totalCount = countResult?.cnt ?? 0;
  const rows = await db.prepare(`${selectSql} LIMIT ${EXPORT_LIMIT}`).bind(...bindings).all<TorrentRow>();
  const truncated = rows.results.length >= EXPORT_LIMIT && totalCount > EXPORT_LIMIT;

  const header = "id,movie_video_code,movie_href,magnet_uri,size,subtitle_indicator,censor_indicator,resolution_type,file_count,datetime_created,session_id";
  const csvRows = rows.results.map((r) =>
    [r.Id, r.movie_video_code ?? "", r.movie_href ?? "", r.MagnetUri ?? "",
     r.Size ?? "", r.SubtitleIndicator, r.CensorIndicator, r.ResolutionType,
     r.FileCount, r.DateTimeCreated ?? "", r.SessionId ?? ""]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",")
  );

  const parts = ["﻿", header, "\n", csvRows.join("\n")];
  if (truncated) {
    parts.push(`\n# Export truncated at ${EXPORT_LIMIT} rows. Total: ${totalCount}`);
  }

  const responseHeaders: Record<string, string> = {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": "attachment; filename=torrents.csv",
  };
  if (truncated) {
    responseHeaders["X-Export-Truncated"] = "true";
    responseHeaders["X-Export-Total-Count"] = String(totalCount);
  }

  const csv = parts.join("");
  // Encode to ensure BOM is preserved through Response transmission
  const encoded = new TextEncoder().encode(csv);
  return new Response(encoded, { headers: responseHeaders });
});
