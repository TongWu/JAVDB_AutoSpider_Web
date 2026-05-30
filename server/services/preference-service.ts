// Preference D1 query layer (ADR-022 Phase 5).
//
// Pure D1 query/upsert helpers for the three preference tables — MovieMetadata,
// MovieRatings, ContentPreferences — all of which live in HISTORY_DB. This file
// is the TypeScript mirror of the Python source of truth (apps/api +
// javdb/storage/repos/{preference_repo,metadata_repo}.py); the SQL and row
// shapes MUST stay byte-for-byte in sync with that contract. Routes are added in
// a later task — keep this module free of Hono / c.env references.
//
// `D1Database` is a global ambient type in this repo (see server/tsconfig.json
// `types: ["@cloudflare/workers-types/2023-07-01"]`), so it is used unimported.

// --- Row interfaces (columns map 1:1 to the D1 DDL) ---

export interface MovieMetadataRow {
  href: string;
  title: string | null;
  video_code: string | null;
  release_date: string | null;
  duration_minutes: number | null;
  rate: number | null;
  comment_count: number | null;
  review_count: number | null;
  want_count: number | null;
  watched_count: number | null;
  maker: string | null;
  publisher: string | null;
  series: string | null;
  directors: string | null;
  categories: string | null;
  poster_url: string | null;
  fanart_urls: string | null;
  trailer_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface MovieRatingRow {
  href: string;
  video_code: string;
  rating: number | null;
  tags: string;
  notes: string | null;
  rated_at: string | null;
  updated_at: string;
}

export interface ContentPreferenceRow {
  content_type: string;
  content_id: string;
  content_name: string;
  hearted: number;
  weight: number;
  updated_at: string;
}

// --- MovieMetadata ---

export async function getMetadata(
  db: D1Database,
  href: string,
): Promise<MovieMetadataRow | null> {
  return db
    .prepare("SELECT * FROM MovieMetadata WHERE href = ?")
    .bind(href)
    .first<MovieMetadataRow>();
}

// --- MovieRatings ---

export async function getRating(
  db: D1Database,
  href: string,
): Promise<MovieRatingRow | null> {
  return db
    .prepare("SELECT * FROM MovieRatings WHERE href = ?")
    .bind(href)
    .first<MovieRatingRow>();
}

// `videoCode` is supplied by the caller (the route layer derives it). To stay in
// sync with the Python source of truth, the caller MUST derive it from the href as
// `href.replace(/^\/video\//, "").replace(/^\/+|\/+$/g, "")` — mirroring
// `re.sub(r'^/video/', '', href).strip('/')` in PreferenceRepo.upsert_rating.
export async function upsertRating(
  db: D1Database,
  href: string,
  videoCode: string,
  rating: number | null,
  tags: string[],
  notes: string | null,
): Promise<MovieRatingRow> {
  const sql = `
    INSERT INTO MovieRatings (href, video_code, rating, tags, notes, rated_at, updated_at)
    VALUES (?, ?, ?, ?, ?,
        strftime('%Y-%m-%dT%H:%M:%fZ','now'),
        strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(href) DO UPDATE SET
        rating     = excluded.rating,
        tags       = excluded.tags,
        notes      = excluded.notes,
        rated_at   = CASE WHEN excluded.rating IS NOT NULL
                          THEN strftime('%Y-%m-%dT%H:%M:%fZ','now')
                          ELSE rated_at END,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`;

  await db
    .prepare(sql)
    .bind(href, videoCode, rating, JSON.stringify(tags), notes)
    .run();

  return (await getRating(db, href))!;
}

export async function listRatings(
  db: D1Database,
  limit: number,
  offset: number,
): Promise<{ items: MovieRatingRow[]; total: number }> {
  const total =
    (await db
      .prepare("SELECT COUNT(*) AS n FROM MovieRatings")
      .first<{ n: number }>())?.n ?? 0;

  const rows = await db
    .prepare(
      "SELECT * FROM MovieRatings ORDER BY updated_at DESC LIMIT ? OFFSET ?",
    )
    .bind(limit, offset)
    .all<MovieRatingRow>();

  return { items: rows.results, total };
}

// --- ContentPreferences ---

export async function upsertPreference(
  db: D1Database,
  contentType: string,
  contentId: string,
  contentName: string,
  hearted: boolean,
  weight: number,
): Promise<ContentPreferenceRow> {
  const sql = `
    INSERT INTO ContentPreferences (content_type, content_id, content_name, hearted, weight, updated_at)
    VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(content_type, content_id) DO UPDATE SET
        content_name = excluded.content_name,
        hearted      = excluded.hearted,
        weight       = excluded.weight,
        updated_at   = strftime('%Y-%m-%dT%H:%M:%fZ','now')`;

  await db
    .prepare(sql)
    .bind(contentType, contentId, contentName, hearted ? 1 : 0, weight)
    .run();

  return (await db
    .prepare(
      "SELECT * FROM ContentPreferences WHERE content_type = ? AND content_id = ?",
    )
    .bind(contentType, contentId)
    .first<ContentPreferenceRow>())!;
}

export async function listPreferences(
  db: D1Database,
  contentType: string | null,
  heartedOnly: boolean,
): Promise<ContentPreferenceRow[]> {
  const conditions: string[] = [];
  const bindings: (string | number)[] = [];

  // Truthy check mirrors Python `if content_type:` — an empty string is treated
  // as "no filter", same as null (valid values are actor/category/maker/director).
  if (contentType) {
    conditions.push("content_type = ?");
    bindings.push(contentType);
  }
  if (heartedOnly) {
    conditions.push("hearted = 1");
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const sql = `SELECT * FROM ContentPreferences ${where} ORDER BY content_type, content_name`;

  const rows = await db
    .prepare(sql)
    .bind(...bindings)
    .all<ContentPreferenceRow>();

  return rows.results;
}
