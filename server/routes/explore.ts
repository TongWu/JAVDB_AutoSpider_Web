import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";
import type { JwtPayload } from "../services/jwt";
import { requireRole } from "../middleware/auth";
import { loadConfigStore, saveConfigKeys } from "../services/config-store";
import {
  detectPageType,
  parseDetailPage,
  parseIndexPage,
  pickBestMagnet,
  sanitizeHtml,
} from "../services/explore-parser";

type ExploreEnv = { Bindings: Env; Variables: { user: JwtPayload } };

export const exploreRoutes = new Hono<ExploreEnv>();

const VALID_JAVDB_HOSTS = /^(?:[a-z0-9-]+\.)*javdb\.com$/i;

function validateJavdbUrl(url: string): void {
  try {
    const parsed = new URL(url);
    if (!VALID_JAVDB_HOSTS.test(parsed.hostname)) {
      throw new HTTPException(422, { message: "URL must be a javdb.com domain" });
    }
    if (parsed.protocol !== "https:") {
      throw new HTTPException(422, { message: "URL must use HTTPS" });
    }
  } catch (e) {
    if (e instanceof HTTPException) throw e;
    throw new HTTPException(422, { message: "Invalid URL" });
  }
}

async function fetchJavdbHtml(url: string, config: Record<string, unknown>): Promise<string> {
  const headers: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7",
  };
  const cookie = String(config.JAVDB_SESSION_COOKIE ?? "");
  if (cookie) {
    headers.Cookie = `_jdb_session=${cookie}`;
  }

  let response: Response;
  try {
    response = await fetch(url, { headers, redirect: "follow" });
  } catch (err) {
    throw new HTTPException(502, {
      message: `Network error fetching javdb: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
  if (!response.ok) {
    const snippet = await response.text().then((t) => t.slice(0, 200)).catch(() => "");
    throw new HTTPException(502, {
      message: `javdb returned HTTP ${response.status}${snippet ? `: ${snippet}` : ""}`,
    });
  }
  return response.text();
}

// --- sync-cookie ---

exploreRoutes.post("/sync-cookie", requireRole("admin"), async (c) => {
  const body = await c.req.json<{ cookie: string }>();
  if (!body.cookie || body.cookie.length > 4096) {
    throw new HTTPException(422, { message: "cookie required (max 4096 chars)" });
  }
  await saveConfigKeys(c.env.OPERATIONS_DB, { JAVDB_SESSION_COOKIE: body.cookie.trim() }, c.env.SECRETS_ENCRYPTION_KEY);
  return c.json({ status: "ok" });
});

// --- proxy-page ---

exploreRoutes.get("/proxy-page", async (c) => {
  const url = c.req.query("url");
  if (!url) {
    throw new HTTPException(400, { message: "url query parameter required" });
  }
  validateJavdbUrl(url);
  const config = await loadConfigStore(c.env.OPERATIONS_DB, c.env.SECRETS_ENCRYPTION_KEY);
  const html = await fetchJavdbHtml(url, config);
  const sanitized = sanitizeHtml(html);
  return new Response(sanitized, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
});

// --- resolve ---

exploreRoutes.post("/resolve", async (c) => {
  const body = await c.req.json<{
    url: string;
    page_num?: number;
    use_proxy?: boolean;
    use_cookie?: boolean;
  }>();
  validateJavdbUrl(body.url);
  const pageNum = body.page_num ?? 1;

  const config = await loadConfigStore(c.env.OPERATIONS_DB, c.env.SECRETS_ENCRYPTION_KEY);
  const fetchUrl = pageNum > 1 ? `${body.url}?page=${pageNum}` : body.url;
  const html = await fetchJavdbHtml(fetchUrl, config);
  const pageType = detectPageType(html);

  if (pageType === "detail") {
    return c.json({
      url: body.url,
      page_type: "detail",
      detail: parseDetailPage(html),
      index: null,
    });
  }
  if (pageType === "index") {
    return c.json({
      url: body.url,
      page_type: "index",
      detail: null,
      index: parseIndexPage(html, pageNum),
    });
  }
  return c.json({
    url: body.url,
    page_type: "unknown",
    detail: null,
    index: null,
  });
});

// --- search-by-video-code ---

exploreRoutes.post("/search-by-video-code", async (c) => {
  const body = await c.req.json<{
    video_code: string;
    use_proxy?: boolean;
    use_cookie?: boolean;
    f?: string;
  }>();

  const code = body.video_code.trim();
  if (!code || code.length > 64) {
    throw new HTTPException(422, { message: "video_code required (max 64 chars)" });
  }

  const filter = (body.f ?? "all").trim();
  const searchUrl = `https://javdb.com/search?q=${encodeURIComponent(code)}&f=${encodeURIComponent(filter)}`;

  const config = await loadConfigStore(c.env.OPERATIONS_DB, c.env.SECRETS_ENCRYPTION_KEY);
  const html = await fetchJavdbHtml(searchUrl, config);
  const parsed = parseIndexPage(html, 1);

  const exactMatch = parsed.movies.find(
    (m) => m.video_code.toLowerCase() === code.toLowerCase(),
  );

  let fallbackSearched = false;
  let fallbackMatch: typeof exactMatch | undefined;
  if (!exactMatch && /[A-Za-z]$/.test(code)) {
    const baseCode = code.slice(0, -1);
    const fallbackUrl = `https://javdb.com/search?q=${encodeURIComponent(baseCode)}&f=${encodeURIComponent(filter)}`;
    try {
      const fallbackHtml = await fetchJavdbHtml(fallbackUrl, config);
      const fallbackParsed = parseIndexPage(fallbackHtml, 1);
      fallbackMatch = fallbackParsed.movies.find(
        (m) => m.video_code.toLowerCase() === code.toLowerCase(),
      );
      fallbackSearched = true;
      if (!fallbackMatch) {
        parsed.movies.push(...fallbackParsed.movies);
      }
    } catch {
      // fallback search failed
    }
  }

  return c.json({
    video_code: code,
    search_url: searchUrl,
    movies: parsed.movies,
    exact_match_entry: exactMatch ?? fallbackMatch ?? null,
    letter_suffix_fallback_searched: fallbackSearched,
  });
});

// --- download-magnet ---

exploreRoutes.post("/download-magnet", requireRole("admin"), async (c) => {
  const body = await c.req.json<{
    magnet: string;
    title?: string;
    category?: string | null;
  }>();

  if (!body.magnet?.startsWith("magnet:?")) {
    throw new HTTPException(422, { message: "magnet must start with 'magnet:?'" });
  }

  throw new HTTPException(501, {
    message: "Direct qB magnet download unavailable in Cloudflare mode. Use GH Actions dispatch (Phase 3).",
  });
});

// --- one-click ---

exploreRoutes.post("/one-click", requireRole("admin"), async (c) => {
  const body = await c.req.json<{
    detail_url: string;
    use_proxy?: boolean;
    use_cookie?: boolean;
    category?: string | null;
  }>();
  validateJavdbUrl(body.detail_url);

  const config = await loadConfigStore(c.env.OPERATIONS_DB, c.env.SECRETS_ENCRYPTION_KEY);
  const html = await fetchJavdbHtml(body.detail_url, config);
  const detail = parseDetailPage(html);
  const selected = pickBestMagnet(detail.magnets);

  if (!selected) {
    return c.json({ status: "no_magnets", video_code: detail.video_code, selected: null });
  }

  return c.json({
    status: "selected",
    video_code: detail.video_code,
    selected: {
      name: selected.name,
      magnet_uri: selected.magnet_uri,
      size: selected.size,
      tags: selected.tags,
    },
  });
});

// --- index-status ---

exploreRoutes.post("/index-status", async (c) => {
  const body = await c.req.json<{
    movies?: Array<{ href: string; video_code?: string }>;
    use_proxy?: boolean;
    use_cookie?: boolean;
  }>();

  const movies = body.movies ?? [];
  if (movies.length === 0) {
    return c.json({ items: {} });
  }

  const db = c.env.HISTORY_DB;
  const items: Record<string, { downloaded: boolean; has_uncensored: boolean }> = {};

  for (const movie of movies.slice(0, 30)) {
    const row = await db
      .prepare("SELECT Id FROM MovieHistory WHERE Href = ?")
      .bind(movie.href)
      .first<{ Id: number }>();
    items[movie.href] = {
      downloaded: !!row,
      has_uncensored: false,
    };
  }

  return c.json({ items });
});
