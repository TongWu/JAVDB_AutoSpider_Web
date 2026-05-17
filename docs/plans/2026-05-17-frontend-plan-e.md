# Plan E — Browse page (Resolve / Lists / Preview)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After Plan D the operator can run ingestion, watch logs, manage sessions, and edit configuration. Plan E gives them the front door to the actual JAVDB content surface — a Browse page that resolves a video code or javdb URL into a styled detail card with magnet actions (Resolve), explores ranked / category / tag pages as a virtualised card grid (Lists), and offers a sandboxed iframe snapshot for parse-debugging (Preview). After Plan E, every Phase-1 navigation item is wired and the FE covers the most common operator workflows without leaving the console.

**Architecture:** All work is in the new FE repo. Five sequential tasks (E1–E5), each a single PR/commit. `/browse` is its own route with three in-page tabs (`Resolve` / `Lists` / `Preview`) backed by query-string state so a deep link like `/browse?mode=resolve&q=ABC-123` is shareable and resumable. We add ~16 components, 1 store, 1 composable (D1 status badge poller), 6 API wrappers, ~10 unit specs, and 3 Playwright journeys.

**Tech stack:** Vue 3.5 + Naive UI + Pinia + vue-router + axios + vue-i18n + `@vueuse/core` (IntersectionObserver helper). No new runtime libraries.

**Spec:** [`docs/superpowers/specs/2026-05-16-frontend-rewrite-design.md`](https://github.com/TongWu/JAVDB_AutoSpider_CICD/blob/main/docs/superpowers/specs/2026-05-16-frontend-rewrite-design.md) §6.3 (Browse sketch), §6.4 (D1 badge mechanics), §10.2 journeys 4 / 4a / 4b, §12.1 (Browse risks & mitigations).

**Prerequisites met by Plans A–D:**

- BE endpoints (existing, no new BE work in Plan E):
  - `POST /api/explore/search-by-video-code` — search by code (e.g. `ABC-123`) → list of candidate movies with exact-match anchor.
  - `POST /api/explore/resolve` — given a javdb URL, fetch and parse to a typed `ExploreResolveResponse` (detail OR index).
  - `POST /api/explore/index-status` — given a list of `{href}` records, return D1 commit/pending/failed/unknown state per href.
  - `POST /api/explore/download-magnet` — push a magnet to qBittorrent.
  - `POST /api/explore/one-click` — resolve + best-match select + push (the "fast path").
  - `POST /api/explore/sync-cookie` — accept a fresh `_jdb_session` value from the FE.
  - `GET /api/explore/proxy-page?url=...` — fetch a javdb URL and return sanitized HTML for the Preview iframe.
  - `POST /api/parse/url` — server-side fetch + parse of any javdb URL into typed sections (used by Lists).
- FE infra: auth store with role gating, axios + CSRF interceptors, generated `api.gen.ts` types for explore + parse endpoints, i18n parity (en / zh-CN / ja), `<AppShell>` sidebar with a `browse` placeholder ready to route.

**Out of scope / deferred:**

- **Interactive embedded javdb browser** — explicitly out per spec §3. Preview is a one-shot sanitized snapshot, not a navigation surface.
- **Editing javdb cookie outside Browse** — Settings / Diagnostics may add their own javdb session widget in Phase 2; Plan E only ships the Browse toolbar `Cookie sync` button.
- **Per-row magnet rename / category override on download** — `apiDownloadMagnet` accepts a `category` field but Plan E ships the simple "download with default category" flow. Power-user options can land in Phase 2.
- **Custom-URL Lists tab** uses the existing `parse/url` contract. Tailoring per parser tab (top vs. category vs. tags) is achieved by constructing the URL from a template and posting to `parse/url` — we do **not** call `parse/top` / `parse/category` / `parse/tags` directly because those endpoints take raw HTML (`HtmlPayload`), not URLs. This is a quiet correction to the spec's §6.3 wording.

---

## File map

```text
src/
├── api/
│   ├── explore.ts                apiSearchByVideoCode / apiResolve / apiIndexStatus / apiDownloadMagnet / apiOneClick / apiProxyPage / apiSyncCookie
│   └── parse.ts                  apiParseUrl
├── stores/
│   └── browse.ts                 mode tab, query, last resolve result, list page, magnet selection, recent searches (sessionStorage)
├── composables/
│   ├── useIndexStatus.ts         queue + 150 ms debounce + 50-href flush + Map<href, status>
│   └── useIntersectionVisible.ts thin wrapper over IntersectionObserver for the Lists grid
├── components/
│   └── browse/
│       ├── BrowseToolbar.vue         search input + recent dropdown + Cookie-sync button
│       ├── BrowseTabs.vue            Resolve / Lists / Preview with query-string sync
│       ├── ResolveCard.vue           detail thumbnail + title + code + actors + tags + magnet table
│       ├── ResolveMagnetTable.vue    sortable NDataTable + D1 badge per row + Download button
│       ├── ListsTabs.vue             Top / Categories / Tags / Custom URL
│       ├── ListsGrid.vue             virtualised card grid (CSS grid + IntersectionObserver)
│       ├── ListsCard.vue             thumb + title + code + D1 badge dot
│       ├── PreviewFrame.vue          sandboxed iframe + "Parse this" handoff
│       └── D1StatusDot.vue           6 px coloured dot + hover tooltip
├── pages/
│   └── BrowsePage.vue                shell: toolbar + tabs + active sub-view
├── router/
│   └── routes.ts                     + /browse  (requiresAuth)
└── i18n/locales/{en,zh-CN,ja}.json   + browse.* tree
tests/
├── unit/
│   ├── browse-store.spec.ts
│   ├── use-index-status.spec.ts
│   ├── resolve-magnet-table.spec.ts
│   ├── lists-grid.spec.ts
│   └── d1-status-dot.spec.ts
└── e2e/
    ├── browse-resolve.spec.ts        Journey 4 (Resolve a code → magnet → one-click)
    ├── browse-lists.spec.ts          Journey 4a (Lists → badges → cookie sync)
    └── browse-preview.spec.ts        Journey 4b (Preview → Parse this → Resolve)
```

---

## Tasks (sequential — each builds on previous)

### Task E1: Browse layout + Resolve sub-mode

**Outcome:** `/browse` route renders the BrowseToolbar + BrowseTabs shell with `mode=resolve` as the default. The search input accepts either a video code (regex matches `^[A-Z0-9]{2,6}-[0-9]{2,5}$`) or any `javdb.com/v/...` URL. Submit dispatches `apiSearchByVideoCode` (code) or `apiResolve` (URL) and renders `ResolveCard` + `ResolveMagnetTable`. Each magnet row has an admin-only `Download to qBittorrent` button and the page has a top-level `One-click download` action. D1 badges render as raw placeholders in this task (the live composable arrives in E2).

Land:

- `src/api/explore.ts` — six wrappers, all using `RequestBodyFor` / `ResponseFor` against `api.gen.ts`. Re-export shared shapes from the BE: `ExploreResolveResponse`, `VideoCodeSearchResponse`, `ExploreIndexStatusResponse`, `ExploreOneClickResponse`, `ExploreMagnetPayload`.
- `src/api/parse.ts` — `apiParseUrl(url, opts?)` wrapping `POST /api/parse/url`.
- `src/stores/browse.ts` — Pinia store with `mode`, `query`, `lastResolve` (ExploreResolveResponse | VideoCodeSearchResponse), `pendingDownload: string|null`, `recentSearches: string[]` (persisted via `useStorage` to `sessionStorage`, capped at 10), and actions `setMode`, `submit(query)`, `downloadMagnet(magnet, title, category?)`, `oneClick(detailUrl)`.
- `src/components/browse/BrowseToolbar.vue` — NInput + Recent dropdown + Cookie-sync NButton (admin only). On submit, calls `browse.submit()`; on cookie-sync, opens a small `NPopover` with a textarea + "Upload" → `apiSyncCookie`.
- `src/components/browse/BrowseTabs.vue` — NTabs synced to `route.query.mode`. Selecting a tab pushes `?mode=...` and clears `lastResolve` where appropriate.
- `src/components/browse/ResolveCard.vue` — NCard with thumbnail (img `loading="lazy"`), title, code, release date, actors (NTag list), categories, and the magnet table embedded. Top-right `One-click download` button (admin only).
- `src/components/browse/ResolveMagnetTable.vue` — NDataTable, columns: Title (truncated), Size, Quality (NTag), Date, D1 badge placeholder, Action. Action = NButton `Download` (admin only) → `browse.downloadMagnet(...)`. Default sort: Size desc.
- `src/pages/BrowsePage.vue` — page shell wiring toolbar + tabs + the Resolve sub-view as the only active body. Lists and Preview are stub `<div>`s in this commit.
- `src/router/routes.ts` — add `{ path: '/browse', component: () => import('@/pages/BrowsePage.vue'), meta: { requiresAuth: true } }`.
- Wire the sidebar `browse` key in `AppShell.vue` (or wherever the nav lives) to `router.push('/browse')`.
- i18n keys under `browse.*` in all three locales (subtitle, modes, toolbar, resolve.*, magnet.*, oneClick.*, cookieSync.*, recent.*, error.*).
- `tests/unit/browse-store.spec.ts` — `submit('ABC-123')` calls `apiSearchByVideoCode`; `submit('https://javdb.com/v/abc')` calls `apiResolve`; `recentSearches` capped at 10 with dedupe.
- `tests/unit/resolve-magnet-table.spec.ts` — renders rows from a fixture; sort toggles the order; admin sees Download button, readonly does not.

Commit: `feat(browse): layout + Resolve sub-mode (search-by-code / resolve / one-click / download-magnet)`.

### Task E2: D1 status badge composable + dot component

**Outcome:** `useIndexStatus()` composable maintains an in-component `Map<href, IndexStatus>` and a queue. Callers register hrefs as they enter the viewport (`observe(href)`); the composable batches them via 150 ms debounce, flushes up to 50 at a time to `POST /api/explore/index-status`, and stores results. Results are cached for the lifetime of the component (page mount). The `D1StatusDot.vue` component takes `{ status }` and renders a 6 px dot with the colour scheme from spec §6.4 (committed / pending / failed_recent / unknown) plus an NTooltip showing `SessionId · last action timestamp · last error (if any)` when known.

Land:

- `src/composables/useIndexStatus.ts` — returns `{ observe, unobserve, status, isLoading }`. Uses `setTimeout` for debounce; on flush, splits queue into chunks of ≤50, calls `apiIndexStatus({ movies: [{href}, ...] })`, merges response into the Map. Auto-clears pending timer on `onScopeDispose`.
- `src/composables/useIntersectionVisible.ts` — thin wrapper around `IntersectionObserver` with `rootMargin: '200px'` so badges render slightly ahead of the scroll line. Used by both Lists cards (E3) and Resolve magnet rows (E2 wires them).
- `src/components/browse/D1StatusDot.vue` — props `{ status: 'committed'|'pending'|'failed_recent'|'unknown', meta?: { session_id?, last_seen?, last_error? } }`. Colour map matches §6.4: `#10b981`, `#f59e0b`, `#dc2626`, `#9ca3af`.
- Wire `ResolveMagnetTable.vue` to use `useIndexStatus()` per magnet href (the BE returns `downloaded` / `has_uncensored` per href today — map to status: `downloaded=true` ⇒ `committed`, otherwise `unknown`; flesh out when BE response grows).
- `tests/unit/use-index-status.spec.ts` — registering 60 hrefs flushes in two batches of ≤50 after the debounce; clearing the timer on unmount.
- `tests/unit/d1-status-dot.spec.ts` — colour assertions for each status; tooltip renders the metadata.

Commit: `feat(browse): D1 status badge composable + dot component`.

### Task E3: Lists sub-mode (Top / Categories / Tags / Custom URL)

**Outcome:** The Lists tab shows four sub-tabs. Each sub-tab posts to `/api/parse/url` with a constructed URL (e.g. Top → `https://javdb.com/rankings/movies`, Categories → a category picker drives the URL, Tags → tag picker, Custom URL → free-form input). Result renders as a virtualised grid of `<ListsCard>` items. Each card has its D1 badge from `useIndexStatus()`. Pagination uses the response's reported page count where available; otherwise a "Load more" button refetches with `page_num++`.

Land:

- `src/components/browse/ListsTabs.vue` — NTabs for Top / Categories / Tags / Custom URL. Each tab owns its current URL builder logic and renders a `<ListsGrid>`.
- `src/components/browse/ListsGrid.vue` — virtualised CSS grid (manual virtualisation using `useIntersectionVisible` to render rows in batches; avoids pulling in `vue-virtual-scroller` for a single use case).
- `src/components/browse/ListsCard.vue` — thumbnail + title + code + D1StatusDot. On click, switches mode to `resolve` with the card's href as `query`.
- Extend `stores/browse.ts` with `listsTab`, `listsPageNum`, `listsHasMore`, `listsCards: Movie[]`, action `loadListsPage(opts)`.
- i18n: `browse.lists.{tabs, loadMore, empty}` in all three locales.
- `tests/unit/lists-grid.spec.ts` — virtual rendering pulls in cards as IntersectionObserver fires; click on a card transitions store mode.

Commit: `feat(browse): Lists sub-mode with Top/Categories/Tags/Custom URL`.

### Task E4: Preview sub-mode

**Outcome:** Preview accepts a URL (defaults to the current `query`) and calls `GET /api/explore/proxy-page?url=...`. The returned sanitized HTML is injected into a sandboxed iframe (`sandbox="allow-same-origin"` — read only; no scripts, no top navigation). A `Parse this` button above the iframe sets the store mode to `resolve` and triggers a `submit(currentUrl)` so the operator can compare what BE saw versus what the parser produced.

Land:

- `src/components/browse/PreviewFrame.vue` — iframe with a `srcdoc` binding to the BE response. `Parse this` button + `Open in new tab` (links to the proxy-page URL, not javdb directly).
- Wire `BrowseTabs.vue`'s Preview branch to render `<PreviewFrame>`.
- i18n: `browse.preview.{title, parseThis, fetchFailed, noUrl}`.
- `tests/unit/preview-frame.spec.ts` — `Parse this` switches the store mode to `resolve` and submits.

Commit: `feat(browse): Preview sub-mode with sandboxed iframe`.

### Task E5: E2E journeys

**Outcome:** Three Playwright specs cover the Browse end-to-end against a real BE (`@external` tagged for the parts that hit javdb.com; the bulk runs against mocked routes per the existing fixture pattern).

Land:

- `tests/e2e/browse-resolve.spec.ts` — Journey 4: login → /browse → enter `ABC-123` → see resolve card → click first magnet's Download → success toast. (Mocks `/api/explore/*` with fixture data.)
- `tests/e2e/browse-lists.spec.ts` — Journey 4a: /browse?mode=lists → Top tab → at least one card → badge shows → click Cookie sync → enter cookie → upload.
- `tests/e2e/browse-preview.spec.ts` — Journey 4b: /browse?mode=preview → enter URL → iframe loads → click Parse this → mode becomes resolve.
- `tests/e2e/fixtures/javdb-mocks.ts` — extract the `/api/explore/*` and `/api/parse/url` mock responses so resolve / lists specs share fixtures.

Commit: `test(e2e): journeys 4/4a/4b (browse resolve/lists/preview)`.

---

## Verification

After E1–E5 land:

```bash
npm run lint           # 0 errors
npm run typecheck      # clean
npm run test:unit      # +~10 new specs over Plan D's 54
npm run test:contract  # no regression
npm run build          # success
# E2E in CI (mocked journeys run unconditionally; @external tagged subset on nightly cron only)
```

Visual smoke (manual):

1. `npm run dev` + BE running locally.
2. Login → /browse → enter video code → see resolve card → download magnet.
3. Switch to Lists → Top → cards render with badges.
4. Switch to Preview → enter URL → iframe loads → Parse this returns to Resolve.
5. Cookie sync → paste a fresh cookie → confirm BE accepts.

---

## Out of scope for Plan E (lands in Phase 2)

- **Magnet preview (file listing inside torrent)** — needs a BE endpoint for tracker probes.
- **Bulk download from Lists** — multi-select cards then push together; deferred until at least one operator asks for it.
- **D1 badge live refresh while staying on page** — current model is one-shot per mount. A WebSocket / poll layer could refresh after a session commit; out of scope.
- **Embedded debug overlay** — the original "interactive iframe with injected overlays" idea is permanently out per spec §3.

---

## Done criteria

- [ ] `/browse` routes correctly and the Resolve sub-mode resolves codes + URLs end-to-end.
- [ ] D1 badges render for Resolve magnet rows and Lists cards with the spec §6.4 colour scheme.
- [ ] Lists sub-mode renders cards from all four sub-tabs (Top / Categories / Tags / Custom URL).
- [ ] Preview sub-mode displays a sandboxed iframe of the BE-fetched HTML and "Parse this" hands off to Resolve.
- [ ] Sidebar `browse` key is wired.
- [ ] 3 new E2E journeys (4 / 4a / 4b) pass in CI under the mocked variant.
- [ ] No regression in Plan A–D unit / contract / E2E suites.
- [ ] i18n parity test still passes (all new keys present in zh-CN / en / ja).
