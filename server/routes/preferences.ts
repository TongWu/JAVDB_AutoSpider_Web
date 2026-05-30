import { Hono } from "hono";
import type { Env } from "../env";
import type { JwtPayload } from "../services/jwt";
import {
  getMetadata, getRating, upsertRating, listRatings,
  upsertPreference, listPreferences,
} from "../services/preference-service";

type PrefEnv = { Bindings: Env; Variables: { user: JwtPayload } };

export const preferencesRoutes = new Hono<PrefEnv>();

// --- Constants (mirror the Python source of truth) ---

const VALID_CONTENT_TYPES = new Set(["actor", "category", "maker", "director"]);

// Mirror javdb/storage/preference_tags.py VALID_TAGS exactly (12 slugs).
const VALID_TAGS = new Set([
  "quality_high", "quality_low", "resolution_bad", "encoding_bad",
  "plot_good", "actress_standout", "not_my_type", "category_miss",
  "would_rewatch", "keep_long_term", "delete_candidate", "upgrade_wanted",
]);

// --- Helpers ---

// Errors mirror the global app.onError envelope: { error: { code, message } }.
const errJson = (code: string, message: string) => ({ error: { code, message } });

function safeParseTags(s: string): string[] {
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeParseJson(s: string | null): unknown {
  if (s === null || s === "") return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

// --- Movie ratings ---

// PUT /movies/:href/rating — upsert a rating.
preferencesRoutes.put("/movies/:href/rating", async (c) => {
  const href = c.req.param("href");
  let body: { rating?: number | null; tags?: string[]; notes?: string | null };
  try {
    body = await c.req.json();
  } catch {
    return c.json(errJson("preferences.invalid_body", "Request body must be valid JSON"), 422);
  }
  const tags = body.tags ?? [];
  if (!Array.isArray(tags)) {
    return c.json(errJson("preferences.invalid_tags", "tags must be an array of strings"), 422);
  }

  const invalid = tags.filter((t) => !VALID_TAGS.has(t));
  if (invalid.length > 0) {
    return c.json(errJson("preferences.invalid_tags", `Unknown tags: ${invalid.join(", ")}`), 422);
  }

  // Mirror Python schema bound `rating: int = Field(ge=1, le=5)` (ADR-017 dual-backend
  // parity) — also guards the DB CHECK so a bad value yields a 422, not a 500.
  if (body.rating != null && (!Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5)) {
    return c.json(errJson("preferences.invalid_rating", "rating must be an integer between 1 and 5"), 422);
  }

  // Mirror Python `re.sub(r'^/video/', '', href).strip('/')`.
  const videoCode = href.replace(/^\/video\//, "").replace(/^\/+|\/+$/g, "");
  const row = await upsertRating(c.env.HISTORY_DB, href, videoCode, body.rating ?? null, tags, body.notes ?? null);
  return c.json({ ...row, tags: safeParseTags(row.tags) });
});

// GET /movies/ratings — list ratings.
preferencesRoutes.get("/movies/ratings", async (c) => {
  const raw = Number(c.req.query("limit") ?? 50);
  const limit = Number.isNaN(raw) ? 50 : Math.max(1, Math.min(200, raw));
  const offset = Math.max(0, Number(c.req.query("offset") ?? 0) || 0);

  const { items, total } = await listRatings(c.env.HISTORY_DB, limit, offset);
  return c.json({ items: items.map((r) => ({ ...r, tags: safeParseTags(r.tags) })), total });
});

// GET /movies/:href/rating — get one rating.
preferencesRoutes.get("/movies/:href/rating", async (c) => {
  const row = await getRating(c.env.HISTORY_DB, c.req.param("href"));
  if (row === null) {
    return c.json(errJson("preferences.not_found", "Record not found"), 404);
  }
  return c.json({ ...row, tags: safeParseTags(row.tags) });
});

// --- Content preferences ---

// PUT /:contentType/:contentId — upsert a content preference.
preferencesRoutes.put("/:contentType/:contentId", async (c) => {
  const contentType = c.req.param("contentType");
  if (!VALID_CONTENT_TYPES.has(contentType)) {
    return c.json(errJson("preferences.invalid_content_type", "content_type must be one of: actor, category, maker, director"), 422);
  }
  const contentId = c.req.param("contentId");
  let body: { content_name?: string; hearted?: boolean; weight?: number };
  try {
    body = await c.req.json();
  } catch {
    return c.json(errJson("preferences.invalid_body", "Request body must be valid JSON"), 422);
  }

  // Mirror Python schema: content_name is required, weight is bounded [0.0, 10.0].
  if (typeof body.content_name !== "string" || body.content_name.length === 0) {
    return c.json(errJson("preferences.invalid_content_name", "content_name is required"), 422);
  }
  const weight = body.weight ?? 1.0;
  if (typeof weight !== "number" || Number.isNaN(weight) || weight < 0 || weight > 10) {
    return c.json(errJson("preferences.invalid_weight", "weight must be between 0.0 and 10.0"), 422);
  }

  const row = await upsertPreference(c.env.HISTORY_DB, contentType, contentId, body.content_name, body.hearted ?? false, weight);
  return c.json({ ...row, hearted: Boolean(row.hearted) });
});

// GET / — list content preferences.
preferencesRoutes.get("/", async (c) => {
  const contentType = c.req.query("content_type") ?? null;
  const heartedOnly = c.req.query("hearted_only") === "true";
  if (contentType && !VALID_CONTENT_TYPES.has(contentType)) {
    return c.json(errJson("preferences.invalid_content_type", "content_type must be one of: actor, category, maker, director"), 422);
  }
  const items = await listPreferences(c.env.HISTORY_DB, contentType, heartedOnly);
  return c.json({ items: items.map((r) => ({ ...r, hearted: Boolean(r.hearted) })) });
});

// --- Movie metadata ---

// GET /metadata/:href — get metadata.
preferencesRoutes.get("/metadata/:href", async (c) => {
  const row = await getMetadata(c.env.HISTORY_DB, c.req.param("href"));
  if (row === null) {
    return c.json(errJson("preferences.not_found", "Record not found"), 404);
  }
  // Mirror Python _row_to_metadata: JSON-parse the link/list columns, pass the rest through.
  return c.json({
    ...row,
    maker: safeParseJson(row.maker),
    publisher: safeParseJson(row.publisher),
    series: safeParseJson(row.series),
    directors: safeParseJson(row.directors),
    categories: safeParseJson(row.categories),
    fanart_urls: safeParseJson(row.fanart_urls),
  });
});
