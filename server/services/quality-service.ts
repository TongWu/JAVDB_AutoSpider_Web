// Torrent quality D1 query layer (ADR-024 Phase 2, read-only).
//
// TypeScript mirror of the Python source of truth
// javdb/storage/repos/torrent_quality_repo.py (TorrentQualityRepo). The SELECT
// column lists, WHERE clauses, and ORDER BY MUST stay byte-for-byte in sync with
// that repo per the ADR-018 dual-backend rule. The two tables live in REPORTS_DB
// and sit OUTSIDE the Pending->Commit session flow (rows are written by the
// Python collector via direct UPSERT in shadow mode).
//
// Routes shape these raw rows into the API response (bool / JSON columns) — see
// server/routes/quality.ts. Keep this module free of Hono / c.env references.
//
// `D1Database` is a global ambient type in this repo (see server/tsconfig.json
// `types: ["@cloudflare/workers-types/2023-07-01"]`), so it is used unimported.

// --- Row interfaces (columns map 1:1 to 2026_05_31_add_torrent_quality_tables.sql) ---

// One row of TorrentQualityEvaluation. Integer 0/1 columns surface as numbers;
// the `*_json` columns are raw JSON strings (parsed in the route).
export interface TorrentQualityEvaluationRow {
  info_hash: string;
  movie_href: string;
  scoring_version: string;
  video_code: string | null;
  javdb_category: string | null;
  magnet_name: string | null;
  javdb_tags_json: string | null;
  javdb_size_text: string | null;
  inferred_category: string | null;
  category_consistent: number | null;
  subtitle_evidence: string | null;
  resolution_consistent: number | null;
  source_trust: string | null;
  score: number | null;
  shadow_rank: number | null;
  would_replace_current_choice: number | null;
  policy_mode: string | null;
  decision: string | null;
  reasons_json: string | null;
}

// One row of TorrentQualityEvidence.
export interface TorrentQualityEvidenceRow {
  info_hash: string;
  probe_schema_version: string;
  target_role: string;
  probe_target_name: string | null;
  metadata_status: string | null;
  metadata_started_at: string | null;
  metadata_completed_at: string | null;
  total_size_bytes: number | null;
  main_video_size_bytes: number | null;
  main_video_ratio: number | null;
  video_file_count: number | null;
  subtitle_file_count: number | null;
  non_video_file_count: number | null;
  junk_size_bytes: number | null;
  junk_size_ratio: number | null;
  suspicious_file_count: number | null;
  features_json: string | null;
  reasons_json: string | null;
  source_fingerprint: string | null;
}

// SELECT column lists mirror torrent_quality_repo.py `_EVALUATION_COLUMNS` /
// `_EVIDENCE_COLUMNS` exactly (same names, same order).
const EVALUATION_COLUMNS = [
  "info_hash",
  "movie_href",
  "scoring_version",
  "video_code",
  "javdb_category",
  "magnet_name",
  "javdb_tags_json",
  "javdb_size_text",
  "inferred_category",
  "category_consistent",
  "subtitle_evidence",
  "resolution_consistent",
  "source_trust",
  "score",
  "shadow_rank",
  "would_replace_current_choice",
  "policy_mode",
  "decision",
  "reasons_json",
].join(", ");

const EVIDENCE_COLUMNS = [
  "info_hash",
  "probe_schema_version",
  "target_role",
  "probe_target_name",
  "metadata_status",
  "metadata_started_at",
  "metadata_completed_at",
  "total_size_bytes",
  "main_video_size_bytes",
  "main_video_ratio",
  "video_file_count",
  "subtitle_file_count",
  "non_video_file_count",
  "junk_size_bytes",
  "junk_size_ratio",
  "suspicious_file_count",
  "features_json",
  "reasons_json",
  "source_fingerprint",
].join(", ");

// Mirrors TorrentQualityRepo.list_recent_evaluations — newest first, with the PK
// columns as deterministic tie-breakers. `limit` is capped by the caller (route).
export async function listRecentEvaluations(
  db: D1Database,
  limit: number,
): Promise<TorrentQualityEvaluationRow[]> {
  const sql =
    `SELECT ${EVALUATION_COLUMNS} FROM TorrentQualityEvaluation ` +
    "ORDER BY created_at DESC, info_hash DESC, movie_href DESC, " +
    "scoring_version DESC LIMIT ?";
  const rows = await db.prepare(sql).bind(limit).all<TorrentQualityEvaluationRow>();
  return rows.results;
}

// Mirrors TorrentQualityRepo.list_evaluations_for_movie — all evaluations for one
// movie ordered by shadow_rank ASC (nulls sort first under SQLite, matching the
// Python source which performs no extra filtering).
export async function listEvaluationsForMovie(
  db: D1Database,
  movieHref: string,
): Promise<TorrentQualityEvaluationRow[]> {
  const sql =
    `SELECT ${EVALUATION_COLUMNS} FROM TorrentQualityEvaluation ` +
    "WHERE movie_href = ? ORDER BY shadow_rank ASC";
  const rows = await db.prepare(sql).bind(movieHref).all<TorrentQualityEvaluationRow>();
  return rows.results;
}

// Mirrors TorrentQualityRepo.get_evidence — single row keyed by the evidence PK.
export async function getEvidence(
  db: D1Database,
  infoHash: string,
  probeSchemaVersion: string,
  targetRole: string,
): Promise<TorrentQualityEvidenceRow | null> {
  const sql =
    `SELECT ${EVIDENCE_COLUMNS} FROM TorrentQualityEvidence ` +
    "WHERE info_hash = ? AND probe_schema_version = ? AND target_role = ?";
  return db
    .prepare(sql)
    .bind(infoHash, probeSchemaVersion, targetRole)
    .first<TorrentQualityEvidenceRow>();
}

// Mirrors TorrentQualityRepo.list_needs_review — evaluations needing operator
// attention (decision='needs_review' OR a probe outranked the production pick).
// Same WHERE/ORDER BY/LIMIT as the Python source; `limit` is capped by the route.
export async function listNeedsReview(
  db: D1Database,
  limit: number,
): Promise<TorrentQualityEvaluationRow[]> {
  const sql =
    `SELECT ${EVALUATION_COLUMNS} FROM TorrentQualityEvaluation ` +
    "WHERE decision = 'needs_review' OR would_replace_current_choice = 1 " +
    "ORDER BY created_at DESC, info_hash DESC, movie_href DESC, " +
    "scoring_version DESC LIMIT ?";
  const rows = await db.prepare(sql).bind(limit).all<TorrentQualityEvaluationRow>();
  return rows.results;
}

// One operator review label (write payload). Mirrors the Python
// torrent_quality_review_repo.ReviewLabel dataclass.
export interface ReviewLabel {
  info_hash: string;
  movie_href: string;
  scoring_version: string;
  label: string;
  reviewer: string | null;
  note: string | null;
}

// Mirrors TorrentQualityReviewRepo.upsert_label — byte-for-byte the same INSERT
// ... ON CONFLICT DO UPDATE over TorrentQualityReviewLabel (REPORTS_DB). The PK is
// (info_hash, movie_href, scoring_version), so a re-submit overwrites the label /
// reviewer / note / reviewed_at. `reviewed_at` is stamped server-side by the route.
export async function upsertReviewLabel(
  db: D1Database,
  label: ReviewLabel,
  reviewedAt: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO TorrentQualityReviewLabel (
        info_hash, movie_href, scoring_version,
        label, reviewer, note, reviewed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(info_hash, movie_href, scoring_version) DO UPDATE SET
        label=excluded.label,
        reviewer=excluded.reviewer,
        note=excluded.note,
        reviewed_at=excluded.reviewed_at`,
    )
    .bind(
      label.info_hash,
      label.movie_href,
      label.scoring_version,
      label.label,
      label.reviewer,
      label.note,
      reviewedAt,
    )
    .run();
}
