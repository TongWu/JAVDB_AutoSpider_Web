import * as cheerio from "cheerio";
import type { Element as DomElement } from "domhandler";

export type PageType = "detail" | "index" | "unknown";

export interface ParsedMagnet {
  name: string;
  magnet_uri: string;
  size: string;
  tags: string[];
  file_count: number;
}

export interface ParsedDetailPage {
  video_code: string;
  title: string;
  magnets: ParsedMagnet[];
  cover_url: string | null;
  actors: string[];
  release_date: string | null;
  duration: string | null;
  maker: string | null;
}

export interface ParsedIndexMovie {
  href: string;
  video_code: string;
  title: string;
  cover_url: string | null;
  release_date: string | null;
  score: string | null;
  tags: string[];
}

export interface ParsedIndexPage {
  movies: ParsedIndexMovie[];
  current_page: number;
  total_pages: number;
}

export function detectPageType(html: string): PageType {
  if (html.includes("video-detail") || html.includes("magnet-links") || html.includes("movie-panel-info")) {
    return "detail";
  }
  if (html.includes("movie-list") || html.includes("grid-item")) {
    return "index";
  }
  return "unknown";
}

export function parseDetailPage(html: string): ParsedDetailPage {
  const $ = cheerio.load(html);

  const videoCode =
    $(".video-detail .first-block .panel-block:first-child .value").text().trim() ||
    $("h2.title strong").first().text().trim() ||
    "";

  const title = $("h2.title").first().text().trim();
  const coverUrl = $(".video-detail .column-video-cover img").attr("src") ?? null;

  const actors: string[] = [];
  $(".video-detail .panel-block").each((_, el) => {
    const label = $(el).find("strong").text().trim();
    if (label.includes("演員") || label.includes("Actor")) {
      $(el)
        .find("a")
        .each((_, a) => actors.push($(a).text().trim()));
    }
  });

  let releaseDate: string | null = null;
  let duration: string | null = null;
  let maker: string | null = null;
  $(".video-detail .panel-block").each((_, el) => {
    const label = $(el).find("strong").text().trim();
    const value = $(el).find(".value").text().trim();
    if (label.includes("日期") || label.includes("Date")) releaseDate = value;
    if (label.includes("時長") || label.includes("Duration")) duration = value;
    if (label.includes("片商") || label.includes("Maker")) maker = value;
  });

  const magnets: ParsedMagnet[] = [];
  $(".magnet-links .item, #magnets-content .item").each((_, el) => {
    const magnetUri = $(el).find("a[href^='magnet:']").attr("href") ?? "";
    if (!magnetUri) return;
    const name = $(el).find(".name, .magnet-name").text().trim();
    const size = $(el).find(".meta, .size").text().trim();
    const tags: string[] = [];
    $(el)
      .find(".tag, .label")
      .each((_, tag) => tags.push($(tag).text().trim()));
    const fileCountText = $(el).find(".file-count").text().trim();
    const fileCount = parseInt(fileCountText, 10) || 1;
    magnets.push({ name, magnet_uri: magnetUri, size, tags, file_count: fileCount });
  });

  return { video_code: videoCode, title, magnets, cover_url: coverUrl, actors, release_date: releaseDate, duration, maker };
}

export function parseIndexPage(html: string, pageNum: number): ParsedIndexPage {
  const $ = cheerio.load(html);
  const movies: ParsedIndexMovie[] = [];

  $(".movie-list .item, .grid-item").each((_, el) => {
    const link = $(el).find("a").first();
    const href = link.attr("href") ?? "";
    const videoCode = $(el).find(".video-title strong, .uid").text().trim();
    const title = $(el).find(".video-title, .item-title").text().trim();
    const coverUrl = $(el).find("img").attr("src") ?? null;
    const releaseDate = $(el).find(".meta, .has-text-grey-dark").text().trim() || null;
    const score = $(el).find(".score .value, .rate").text().trim() || null;
    const tags: string[] = [];
    $(el)
      .find(".tag, .label")
      .each((_, tag) => tags.push($(tag).text().trim()));
    if (href) {
      movies.push({ href, video_code: videoCode, title, cover_url: coverUrl, release_date: releaseDate, score, tags });
    }
  });

  let totalPages = 1;
  $(".pagination-list a, .pagination a").each((_, el) => {
    const pageText = $(el).text().trim();
    const p = parseInt(pageText, 10);
    if (!isNaN(p) && p > totalPages) totalPages = p;
  });

  return { movies, current_page: pageNum, total_pages: totalPages };
}

export function pickBestMagnet(magnets: ParsedMagnet[]): ParsedMagnet | null {
  if (magnets.length === 0) return null;

  const preferredTokens = ["中字", "字幕", "破解", "uncensored", "無碼", "无码"];
  const hiResTokens = ["高清", "1080"];

  const scored = magnets.map((m) => {
    let score = 0;
    const combined = `${m.name} ${m.tags.join(" ")}`.toLowerCase();
    for (const tok of preferredTokens) {
      if (combined.includes(tok.toLowerCase())) score += 3;
    }
    for (const tok of hiResTokens) {
      if (combined.includes(tok.toLowerCase())) score += 2;
    }
    if (m.size.includes("GB")) score += 1;
    return { magnet: m, score };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.magnet.file_count !== a.magnet.file_count) return b.magnet.file_count - a.magnet.file_count;
    return b.magnet.name.length - a.magnet.name.length;
  });

  return scored[0].magnet;
}

export function sanitizeHtml(html: string): string {
  const $ = cheerio.load(html);

  $("script, iframe, frame, embed, object, noscript, base").remove();
  $("meta[http-equiv]").remove();

  $("*").each((_, el) => {
    const attribs = (el as DomElement).attribs ?? {};
    for (const attr of Object.keys(attribs)) {
      if (attr.startsWith("on")) {
        $(el).removeAttr(attr);
      }
      if (attr === "srcdoc") {
        $(el).removeAttr(attr);
      }
      if (["action", "formaction", "href", "src"].includes(attr)) {
        const val = attribs[attr] ?? "";
        if (val.startsWith("javascript:") || val.startsWith("data:")) {
          $(el).removeAttr(attr);
        }
      }
    }
  });

  return $.html();
}
