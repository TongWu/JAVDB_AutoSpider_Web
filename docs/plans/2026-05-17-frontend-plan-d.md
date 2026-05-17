# Plan D — Sessions + Settings (Config / Auth / Capabilities / Appearance)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After Plan C, an operator can run ingestion and watch logs. Plan D gives them the two things they need next: a **Sessions** page that lists historical ingestion sessions and lets them dry-run + apply rollbacks (or force-commit stuck sessions); and a **Settings** area that exposes the runtime config, auth/session info, capabilities snapshot, and theme/language switching. After Plan D, the system is fully usable from the browser — no more SSH'ing to edit `config.py` or running CLI rollbacks by hand.

**Architecture:** All work is in the new FE repo. Five sequential tasks (D1–D5), each a single PR/commit. Sessions is its own route tree (`/sessions`); Settings is a nested route tree (`/settings/{config,auth,capabilities,appearance}`) with a shared `<SettingsLayout>` shell that renders the four sub-pages as tabs. No new libraries — same stack as Plan B/C.

**Tech stack:** Vue 3.5 + Naive UI + Pinia + vue-router + axios + vue-i18n. We add ~14 components, 2 stores, 4 API wrappers, ~12 unit specs, and 2 Playwright journeys.

**Spec:** [`docs/superpowers/specs/2026-05-16-frontend-rewrite-design.md`](https://github.com/TongWu/JAVDB_AutoSpider_CICD/blob/main/docs/superpowers/specs/2026-05-16-frontend-rewrite-design.md) §6.3 (page sketches), §9.6 (refresh intervals), §10.2 journeys 5/5a/5b/6/7.

**Prerequisites met by Plans A + B + C:**
- BE endpoints: `/api/sessions` (list), `/api/sessions/{id}` (detail), `/api/sessions/{id}/rollback` (dry_run/apply), `/api/sessions/{id}/commit` (force, drop_pending); `/api/config` GET/PUT, `/api/config/meta`; `/api/capabilities`; `/api/auth/login,refresh,logout`.
- FE infra: auth store with token refresh queue, axios client + CSRF, `<AppShell>`, i18n parity (en / zh-CN / ja), `ui` store with `themeMode` + `<NConfigProvider>` wiring in `App.vue`, `i18n` store with locale switcher in `TopBar.vue`.
- Sidebar placeholders already exist for `sessions`, `config`, `auth`, `capabilities`, `appearance` — they just don't route anywhere yet.
- Generated types: `src/types/api.gen.ts` covers all the above.

**Out of scope / deferred (mentioned for explicit handling in D3 below):**
- BE `/api/auth/change-password` endpoint does **not** exist today. D3 ships only "show current user info + logout" UI; password change is called out as a Phase-2 BE task. If we want it in Plan D scope, it needs a small BE PR first — track separately.
- BE `/api/config/meta` returns `{key, section, type, sensitive, readonly}` only — **no description**. D2 sources human-readable labels and descriptions from i18n keys (`settings.config.fields.{KEY}.label` / `.description`) with a sensible fallback (`startCase(KEY)` for missing).

---

## File map

```
src/
├── api/
│   ├── sessions.ts             apiListSessions / apiGetSession / apiRollbackSession / apiCommitSession
│   ├── config.ts               apiGetConfig / apiGetConfigMeta / apiUpdateConfig
│   └── (auth.ts already has apiLogout — re-use; no new endpoints)
├── stores/
│   ├── sessions.ts             list + filters + cursor + polling (10s while any session is running/finalizing)
│   └── config.ts               loaded values + meta + dirty/error state + save action
├── components/
│   ├── sessions/
│   │   ├── SessionTable.vue        NDataTable with state, write mode, run, timestamps
│   │   ├── SessionFilters.vue      NSelect state + NSelect write-mode + search
│   │   ├── SessionDrawer.vue       full session metadata + movies/torrents tabs + rollback/commit actions
│   │   ├── StateBadge.vue          NTag with state→color (in_progress=info, finalizing=warning, committed=success, failed=error)
│   │   ├── RollbackDialog.vue      step 1 dry-run preview, step 2 apply confirm
│   │   └── CommitDialog.vue        confirm force-commit + drop_pending toggle
│   └── settings/
│       ├── SettingsLayout.vue      shared shell: page heading + NTabs (Config/Auth/Capabilities/Appearance)
│       ├── ConfigField.vue         single-field renderer keyed on meta.type
│       ├── ConfigSection.vue       groups fields under a section (qbittorrent / javdb / proxy / smtp / pikpak / rclone / core)
│       ├── CapabilitySnapshot.vue  read-only NDescriptions of the capabilities response
│       ├── AuthInfoCard.vue        username, role, token-expiry countdown, logout button
│       └── AppearanceForm.vue      NRadioGroup theme + NSelect language
├── pages/
│   ├── SessionsPage.vue            filters + table + drawer + rollback dialog + commit dialog
│   └── settings/
│       ├── SettingsConfigPage.vue
│       ├── SettingsAuthPage.vue
│       ├── SettingsCapabilitiesPage.vue
│       └── SettingsAppearancePage.vue
└── router/
    └── routes.ts                   + /sessions, /settings/{config,auth,capabilities,appearance} with redirect /settings → /settings/config
tests/
├── unit/
│   ├── sessions-store.spec.ts
│   ├── rollback-dialog.spec.ts
│   ├── config-store.spec.ts
│   ├── config-field.spec.ts
│   ├── appearance-form.spec.ts
│   └── ...
└── e2e/
    ├── sessions-rollback.spec.ts   Journey 5 + 5a + 5b combined
    └── settings-config.spec.ts     Journey 6: edit config → save → reload masked back
```

---

## Tasks (sequential — each builds on previous)

### Task D1: Sessions page (list + filters + drawer + rollback + commit)

**Outcome:** `/sessions` route renders a table of ingestion sessions, filterable by state and write mode. Clicking any row opens a right drawer showing the session detail (movies + torrents written, run/attempt, timestamps, failure reason). The drawer has two action buttons:
- **Rollback** — opens `<RollbackDialog>` which first calls `/rollback` with `dry_run=true`, shows the planned actions/summary, then a second "Apply rollback" step calls `/rollback` with `dry_run=false`.
- **Force commit** — visible only when `state === 'finalizing'`. Opens `<CommitDialog>` with an optional `drop_pending` toggle; calls `/commit` with `force=true`.

The list polls every 10s while at least one row is in `in_progress` or `finalizing`, paused when the tab is hidden.

Land:
- `src/api/sessions.ts` — `apiListSessions({state?, cursor?, limit?})` → `GET /api/sessions`; `apiGetSession(id)` → `GET /api/sessions/{id}`; `apiRollbackSession(id, {dry_run, include_pending, restore_from_audit})` → `POST /api/sessions/{id}/rollback`; `apiCommitSession(id, {force, drop_pending})` → `POST /api/sessions/{id}/commit`. Tolerate the `[key: string]: unknown` BE response shape (actions/summary are opaque dicts).
- `src/stores/sessions.ts` — state `{items, filters: {state, writeMode, search}, cursor, hasMore, loading, error}`; computed `hasActiveSession` (running/finalizing); actions `fetchList(reset?)` / `loadMore()` / `refresh()` / `setFilter(key, val)` / `getDetail(id)`. Uses `usePolling` keyed on `hasActiveSession` at 10s.
- `src/components/sessions/SessionTable.vue` — NDataTable with columns: Session ID (mono, truncated), State (`<StateBadge>`), Write Mode (NTag), Run (`{run_id}/{run_attempt}` or `—`), Started (relative time), Action (row-click open drawer).
- `src/components/sessions/SessionFilters.vue` — NSelect state multi (in_progress / finalizing / committed / failed), NSelect write-mode (audit / pending), NInput search (filters by session_id contains). Reset button.
- `src/components/sessions/StateBadge.vue` — small wrapper around NTag, status → NTag type.
- `src/components/sessions/SessionDrawer.vue` — NDrawer 720px. Top: NDescriptions grid (session_id, state, write_mode, run, created_at, report_type, failure_reason). Middle: NTabs (Movies | Torrents) each rendering an NDataTable of the detail-response arrays. Footer: Rollback button (any state except `committed` already-rolled), Force-commit button (only `finalizing`).
- `src/components/sessions/RollbackDialog.vue` — two-step NModal. Step 1: "Preview rollback" form (NCheckbox include_pending, NCheckbox restore_from_audit, defaults both true) + "Run dry-run" button → calls `apiRollbackSession(id, {dry_run: true, ...})`, displays `summary` as `<pre>` JSON + actions list count. Step 2: "Apply" button → re-calls with `dry_run: false`. Emits `applied` event → drawer closes + table refreshes + a `<NMessage>` success toast.
- `src/components/sessions/CommitDialog.vue` — NModal with NCheckbox `drop_pending`, big "Force commit" button → `apiCommitSession(id, {force: true, drop_pending})`. Emits `committed` event.
- `src/pages/SessionsPage.vue` — page heading, NTabs not needed (single page); filters row + table + drawer + the two dialogs (`v-model:show` driven from drawer events).
- `src/router/routes.ts` — add `/sessions` route with normal AppShell layout.
- Wire Sidebar `sessions` key to `router.push('/sessions')`.
- i18n keys under `sessions.*` in all three locales: subtitle, col.*, state.*, writeMode.*, action.rollback, action.commit, rollback.* (dialog labels), commit.* (dialog labels).
- `tests/unit/sessions-store.spec.ts` — fetchList populates, filter narrows, polling toggles off when no active session.
- `tests/unit/rollback-dialog.spec.ts` — step 1 calls dry_run=true, step 2 dry_run=false; "Apply" disabled until dry-run completes successfully.

Commit: `feat(sessions): list page + drawer + rollback dry-run/apply + force-commit`.

### Task D2: Settings layout shell + Config tab

**Outcome:** `/settings` redirects to `/settings/config`. Page renders `<SettingsLayout>` (heading + NTabs) with the Config tab active. Config tab shows the runtime config grouped by `section` (Core / Proxy / qBittorrent / PikPak / Rclone / SMTP), each field rendered by `<ConfigField>` keyed on `meta.type`. Sensitive fields show `********` and accept new values; submit-time, fields equal to `********` are dropped (sentinel handled BE-side). Read-only fields are disabled. Save button is enabled only when dirty; on save, calls `PUT /api/config`, on success refreshes both the config payload and `/api/capabilities` (some changes affect ingestion mode etc).

Land:
- `src/api/config.ts` — `apiGetConfig({include_secrets?})` → `GET /api/config` (admin-only when `include_secrets=true`); `apiGetConfigMeta()` → `GET /api/config/meta`; `apiUpdateConfig(payload)` → `PUT /api/config`.
- `src/stores/config.ts` — state `{values, meta, dirty, loading, saving, error}`; actions `fetch()` (parallel `apiGetConfig` + `apiGetConfigMeta`), `set(key, val)` (marks dirty), `save()` (sends only dirty keys, refreshes on success), `reset()`. Selectors: `groupedFields()` → `Record<section, MetaField[]>`.
- `src/components/settings/SettingsLayout.vue` — `<h1>` + page subtitle + NTabs with `default-value` from current route + 4 tab panes. NTabs `on-update:value` does `router.push('/settings/{key}')`. Slot for child page content. Renders the matching sub-page.
- Actually simpler: `SettingsLayout.vue` becomes a route-level layout component, with `<router-view>` inside an NTabs whose tabs are `router-link`s. Sub-page routes use it as their parent.
- `src/components/settings/ConfigField.vue` — props `{meta: MetaField, modelValue, sensitive}`. Renders:
  - `bool` → NSwitch
  - `int` → NInputNumber (integer)
  - `float` → NInputNumber (precision 2)
  - `string` + `sensitive` → NInput type=password with placeholder `********` + show-toggle
  - `string` non-sensitive → NInput
  - `json` → NInput type=textarea (rows 3, monospace, with a JSON.parse round-trip validation on blur)
  - `readonly` → NText muted with current value (display only)
  - Label uses `t(\`settings.config.fields.${key}.label\`, key)` (fallback to key); description below uses `t(\`settings.config.fields.${key}.description\`, '')` if present.
- `src/components/settings/ConfigSection.vue` — NCard with section title + grid of `<ConfigField>` rows. `v-model:values` two-way binding to store.
- `src/pages/settings/SettingsConfigPage.vue` — heading, loading skeleton on first load, `<ConfigSection>` for each group (ordered: core, qbittorrent, javdb, proxy, pikpak, rclone, smtp, notifications, advanced — fallback order from meta if section unknown). Save bar at bottom: shows count of dirty fields + "Save" button + "Discard" button.
- `src/router/routes.ts` — `/settings` redirects to `/settings/config`. Add `/settings/config` using `SettingsLayout` as parent.
- Wire Sidebar `config` and `settings` keys.
- i18n keys: `settings.config.heading`, `settings.config.subtitle`, `settings.config.sections.{core,qbittorrent,javdb,proxy,pikpak,rclone,smtp,notifications,advanced}`, `settings.config.save`, `settings.config.discard`, `settings.config.savedAt`, `settings.config.dirtyHint`. **Do not** ship per-field labels in this commit — let them fall back to the key name. A follow-up Phase-2 task can fill the per-field i18n table.
- `tests/unit/config-store.spec.ts` — `save()` sends only dirty keys, `********` sentinel handling on read.
- `tests/unit/config-field.spec.ts` — each type renders the right Naive UI component; sensitive field clears placeholder on focus.

Commit: `feat(settings): config editor with grouped sections + dirty save`.

### Task D3: Settings/Auth page (display-only)

**Outcome:** `/settings/auth` shows a card with the current logged-in user info: username, role (`admin` / `viewer` badge), session start time (from auth store), token expiry countdown, and a destructive "Sign out" button. A note clarifies that password changes are a CLI operation today (link to the docs page) — this is intentionally scoped so we don't ship a half-working dialog.

Land:
- `src/components/settings/AuthInfoCard.vue` — NCard with NDescriptions: Username, Role (NTag), Session started at (relative + absolute on hover), Token expires in (ticking countdown computed from `auth.expiresAt`). Below: NAlert info "Password change is a server-side operation today. See [docs link]." + NButton danger "Sign out" → `auth.logout()` and `router.push('/login')`.
- `src/pages/settings/SettingsAuthPage.vue` — heading + `<AuthInfoCard>`.
- Add route `/settings/auth`.
- Wire Sidebar `auth` key.
- i18n keys: `settings.auth.heading`, `settings.auth.subtitle`, `settings.auth.username`, `settings.auth.role`, `settings.auth.startedAt`, `settings.auth.expiresIn`, `settings.auth.signOut`, `settings.auth.passwordNote`.
- `tests/unit/auth-info-card.spec.ts` — countdown updates every second; sign-out triggers logout + navigation.

Commit: `feat(settings): auth info card + session expiry countdown`.

### Task D4: Settings/Capabilities page (read-only snapshot)

**Outcome:** `/settings/capabilities` shows the current backend capability snapshot in a read-only descriptions grid: deployment, ingestion_mode, storage_backend, gh_actions tier, features enabled. A "Refresh" button forces re-fetch via `apiCapabilities()`. Mostly diagnostic — useful when self-hosters file bug reports.

Land:
- `src/components/settings/CapabilitySnapshot.vue` — NDescriptions with one row per capability field. Booleans render as NTag (true=success, false=default). Long string lists wrap.
- `src/pages/settings/SettingsCapabilitiesPage.vue` — heading + `<CapabilitySnapshot>` + NButton "Refresh".
- Add route `/settings/capabilities`.
- Wire Sidebar `capabilities` key.
- i18n keys under `settings.capabilities.*`.
- No new unit spec needed — pure display.

Commit: `feat(settings): capabilities snapshot view`.

### Task D5: Settings/Appearance page (theme + language)

**Outcome:** `/settings/appearance` shows two controls:
- **Theme**: NRadioGroup with 3 buttons (Light / Dark / Match system). Persists to `ui.themeMode`. The existing `App.vue` `<NConfigProvider>` already reacts to the store, so this just needs UI.
- **Language**: NSelect with 3 options (English / 简体中文 / 日本語). Persists via `i18n.change()` (already wired to load translations dynamically).

This duplicates the locale switcher in TopBar — intentional, so settings is discoverable for users who don't notice the top bar.

Land:
- `src/components/settings/AppearanceForm.vue` — two NFormItems, each backed by the corresponding store. Reactive — no separate save step.
- `src/pages/settings/SettingsAppearancePage.vue` — heading + `<AppearanceForm>`.
- Add route `/settings/appearance`.
- Wire Sidebar `appearance` key.
- i18n keys: `settings.appearance.heading`, `settings.appearance.theme`, `settings.appearance.theme.light/dark/system`, `settings.appearance.language`.
- `tests/unit/appearance-form.spec.ts` — changing theme NRadioGroup updates `ui.themeMode`; changing language NSelect calls `i18n.change()`.

Commit: `feat(settings): appearance — theme + language picker`.

### Task D6: E2E journeys

**Outcome:** Two Playwright specs cover Sessions and Settings end-to-end against the docker-compose BE.

Land:
- `tests/e2e/sessions-rollback.spec.ts` — Journey 5 + 5a + 5b combined: login → /sessions → see at least one row → click row → drawer opens → click "Rollback" → preview shows actions → click "Apply" → drawer closes + table row updates. Second part: filter `state=finalizing` → click row → "Force commit" → row state becomes `committed`.
- `tests/e2e/settings-config.spec.ts` — Journey 6: login → /settings/config → toggle a non-sensitive bool (e.g. `STRICT_DUAL_WRITE`) → click Save → wait for success toast → reload page → field reflects new value.
- Update test fixtures so the BE container has at least one session in each terminal state seeded (or rely on previous test runs leaving data behind — flag in the fixture which approach was taken).

Commit: `test(e2e): journeys 5/5a/5b/6 (sessions rollback/commit, settings config save)`.

---

## Verification

After D1–D6 land:

```bash
npm run lint           # 0 errors
npm run typecheck      # clean
npm run test:unit      # +~12 new specs over Plan C's ~25
npm run test:contract  # no regression
npm run build          # success
# E2E in CI
```

Visual smoke (manual):
1. `npm run dev` + BE running locally.
2. Login → /sessions → see list, filter, open drawer.
3. From drawer, dry-run rollback → preview JSON → apply → row updates.
4. Navigate to /settings → lands on Config tab.
5. Toggle a bool, edit a string, Save → success toast.
6. Auth tab → countdown ticks, sign out → back to /login.
7. Capabilities tab → snapshot renders, refresh works.
8. Appearance tab → switch theme (page restyles instantly), switch language (UI flips).

---

## Out of scope for Plan D (lands in Plan E or Phase 2)

- **BE `/api/auth/change-password`** — needs a small BE PR (admin re-auth + password hash + audit log). Track as a separate task; D3 ships display-only until then.
- **Per-field config i18n labels/descriptions** — fall back to raw `KEY` for now. A Phase-2 cleanup PR can fill the `settings.config.fields.*.label` translation table for all ~60 config keys.
- **Sessions search by movie/torrent code** — D1 only filters by session_id substring. Cross-search through the movies/torrents arrays is a Phase-2 nice-to-have.
- **Browse page (Resolve / Lists / Preview)** — Plan E.
- **Data tables (Movies / Torrents)** — Phase 2 post-cutover.
- **Diagnostics page (Health / Parse tester)** — Phase 2.

---

## Done criteria

- [ ] `/sessions` lists sessions, filters work, drawer opens.
- [ ] Rollback dry-run → preview → apply flow works on a real session.
- [ ] Force-commit works on a stuck `finalizing` session.
- [ ] `/settings` redirects to `/settings/config`; tabs route correctly.
- [ ] Config edit + save round-trip works (sensitive fields not leaked back).
- [ ] Auth tab shows current user + countdown + sign-out.
- [ ] Capabilities tab renders snapshot + refresh.
- [ ] Appearance tab switches theme and language live.
- [ ] All Sidebar placeholders for the above are routed.
- [ ] 2 new E2E journeys pass in CI.
- [ ] No regression in Plan C unit / contract / E2E suites.
- [ ] i18n parity test still passes (all new keys present in zh-CN/en/ja).
