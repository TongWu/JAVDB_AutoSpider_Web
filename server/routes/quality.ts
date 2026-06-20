// Torrent quality review routes (ADR-024 Phase 2, read-only).
//
// TypeScript mirror of apps/api/routers/quality.py + apps/api/schemas/quality.py
// (ADR-018 dual-backend parity). Two read endpoints over the shadow evidence the
// Python collector already writes:
//   GET /api/quality/evaluations?limit=&movie_href=
//   GET /api/quality/evidence/:info_hash
//
// Row -> response shaping mirrors the Python repo `_to_dict` + router
// `_evaluation_from_row` / `_evidence_from_row`:
//   - integer 0/1 columns (category_consistent, would_replace_current_choice)
//     map to nullable booleans;
//   - `reasons_json` is parsed and filtered to strings, surfacing as `reasons`;
//   - only the fields declared by the Python pydantic schemas are emitted (the
//     repo SELECTs extra columns — javdb_tags_json, resolution_consistent, etc. —
//     which pydantic drops; we drop them the same way).
//
// NOTE: the operator accept/reject WRITE path is intentionally NOT built here. It
// is blocked on the Python IMP-08 assist work (Task A/B) which owns the review-
// label store + write contract. See
// /Users/tedwu/JAVDB_AutoSpider_CICD/docs/design/ADR-024-Torrent-Quality-Evidence/IMP-ADR024-08-phase2-assist.md
// The UI renders accept/reject as disabled "coming soon" affordances; until the
// Python contract exists there is nothing to mirror.

import { Hono } from "hono";
import type { Env } from "../env";
import type { JwtPayload } from "../services/jwt";
import {
  getEvidence,
  listEvaluationsForMovie,
  listRecentEvaluations,
  type TorrentQualityEvaluationRow,
  type TorrentQualityEvidenceRow,
} from "../services/quality-service";

type QualityEnv = { Bindings: Env; Variables: { user: JwtPayload } };

export const qualityRoutes = new Hono<QualityEnv>();

// Mirror apps/api/routers/quality.py constants and javdb/quality/features.py.
const PROBE_SCHEMA_VERSION = "adr024-probe-v1";
const PRODUCTION_DOWNLOAD_ROLE = "production_download";
const LIMIT_DEFAULT = 50;
const LIMIT_CAP = 200;

// Errors mirror the global app.onError envelope: { error: { code, message } }.
// (The Python backend uses {detail}; the TS backend has always used this
// envelope — see routes/preferences.ts — and the SPA's client.ts reads both.)
const errJson = (code: string, message: string) => ({ error: { code, message } });

// --- Response shaping (mirrors schemas/quality.py field sets exactly) ---

interface EvaluationResponse {
  info_hash: string;
  movie_href: string;
  scoring_version: string;
  video_code: string | null;
  javdb_category: string | null;
  magnet_name: string | null;
  inferred_category: string | null;
  category_consistent: boolean | null;
  subtitle_evidence: string | null;
  score: number | null;
  shadow_rank: number | null;
  would_replace_current_choice: boolean | null;
  policy_mode: string | null;
  decision: string | null;
  reasons: string[];
}

interface EvidenceResponse {
  info_hash: string;
  probe_schema_version: string;
  target_role: string;
  probe_target_name: string | null;
  metadata_status: string | null;
  total_size_bytes: number | null;
  main_video_size_bytes: number | null;
  main_video_ratio: number | null;
  video_file_count: number | null;
  subtitle_file_count: number | null;
  non_video_file_count: number | null;
  junk_size_bytes: number | null;
  junk_size_ratio: number | null;
  suspicious_file_count: number | null;
  reasons: string[];
}

// Mirror router `_optional_bool`: null stays null, otherwise 0 -> false, 1 -> true.
function optionalBool(value: number | null): boolean | null {
  return value === null || value === undefined ? null : Boolean(value);
}

// Mirror router `_list_from_jsonish` / `_row_reasons`: parse the JSON string and
// keep only string items; anything else (null, non-list, non-string members,
// malformed JSON) collapses to [].
function parseReasons(reasonsJson: string | null): string[] {
  if (!reasonsJson) return [];
  try {
    const parsed: unknown = JSON.parse(reasonsJson);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function toEvaluationResponse(r: TorrentQualityEvaluationRow): EvaluationResponse {
  return {
    info_hash: r.info_hash,
    movie_href: r.movie_href,
    scoring_version: r.scoring_version,
    video_code: r.video_code,
    javdb_category: r.javdb_category,
    magnet_name: r.magnet_name,
    inferred_category: r.inferred_category,
    category_consistent: optionalBool(r.category_consistent),
    subtitle_evidence: r.subtitle_evidence,
    score: r.score,
    shadow_rank: r.shadow_rank,
    would_replace_current_choice: optionalBool(r.would_replace_current_choice),
    policy_mode: r.policy_mode,
    decision: r.decision,
    reasons: parseReasons(r.reasons_json),
  };
}

function toEvidenceResponse(r: TorrentQualityEvidenceRow): EvidenceResponse {
  return {
    info_hash: r.info_hash,
    probe_schema_version: r.probe_schema_version,
    target_role: r.target_role,
    probe_target_name: r.probe_target_name,
    metadata_status: r.metadata_status,
    total_size_bytes: r.total_size_bytes,
    main_video_size_bytes: r.main_video_size_bytes,
    main_video_ratio: r.main_video_ratio,
    video_file_count: r.video_file_count,
    subtitle_file_count: r.subtitle_file_count,
    non_video_file_count: r.non_video_file_count,
    junk_size_bytes: r.junk_size_bytes,
    junk_size_ratio: r.junk_size_ratio,
    suspicious_file_count: r.suspicious_file_count,
    reasons: parseReasons(r.reasons_json),
  };
}

// --- Routes ---

// GET /evaluations?limit=&movie_href=
//   movie_href present -> list_evaluations_for_movie (ORDER BY shadow_rank ASC)
//   otherwise          -> list_recent_evaluations(min(limit, 200))
// `limit <= 0` -> 400 (checked before branching, mirroring the Python router). A
// non-numeric limit is also rejected here as 400 to avoid binding NaN to SQL
// (FastAPI would 422 on the int coercion; the prompt-pinned behaviour is the
// limit<=0 -> 400 + cap-at-200 contract, which this preserves).
qualityRoutes.get("/evaluations", async (c) => {
  const rawLimit = c.req.query("limit");
  const limit = rawLimit === undefined ? LIMIT_DEFAULT : Number(rawLimit);
  if (!Number.isFinite(limit) || limit <= 0) {
    return c.json(errJson("quality.invalid_limit", "limit must be a positive integer"), 400);
  }

  const movieHref = c.req.query("movie_href");
  const rows =
    movieHref !== undefined
      ? await listEvaluationsForMovie(c.env.REPORTS_DB, movieHref)
      : await listRecentEvaluations(c.env.REPORTS_DB, Math.min(limit, LIMIT_CAP));

  return c.json({ items: rows.map(toEvaluationResponse) });
});

// GET /evidence/:info_hash — production-download evidence for one torrent.
// info_hash is normalized (trim + lowercase) and looked up at the fixed
// (probe_schema_version, target_role) the Python router uses.
qualityRoutes.get("/evidence/:info_hash", async (c) => {
  const infoHash = c.req.param("info_hash").trim().toLowerCase();
  const row = await getEvidence(
    c.env.REPORTS_DB,
    infoHash,
    PROBE_SCHEMA_VERSION,
    PRODUCTION_DOWNLOAD_ROLE,
  );
  if (row === null) {
    return c.json(errJson("quality.evidence_not_found", "Evidence not found"), 404);
  }
  return c.json(toEvidenceResponse(row));
});
