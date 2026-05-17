# Plan C — Onboarding + Run + Tasks

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the three core Phase-1 pages that turn the empty Plan B shell into a usable system: a 5-step **Onboarding** wizard a self-hoster runs once, a **Run** page that triggers Daily or Ad Hoc ingestion and streams logs, and a **Tasks** page that lists historical runs with a log drawer. After Plan C, a fresh user can `docker compose up`, walk the wizard, kick off their first ingestion, and watch it complete.

**Architecture:** Three independent route trees sharing the existing `<AppShell>` layout (Run + Tasks) plus one standalone route (Onboarding, `meta.layout = 'blank'`). New API wrappers extend Plan B's `src/api/` layer; new Pinia stores extend `src/stores/`; new pages drop into `src/pages/`. Live log streaming lives in `composables/useLogStream.ts` (placeholder created in Plan B, real impl here). Form validation and table virtualization both come from Naive UI primitives — no new libraries.

**Tech stack:** Same as Plan B — no additions. Vue 3.5 + Naive UI + Pinia + vue-router + axios + vue-i18n. We add ~15 components, 3 stores, 5 API wrappers, 4 composables, 12 unit specs, and 3 Playwright journeys.

**Spec:** [`docs/superpowers/specs/2026-05-16-frontend-rewrite-design.md`](https://github.com/TongWu/JAVDB_AutoSpider_CICD/blob/main/docs/superpowers/specs/2026-05-16-frontend-rewrite-design.md) §6.3 (page sketches), §7 (Onboarding), §10.2 journeys 1/2/3/8a.

**Prerequisites met by Plan A + B:**
- BE endpoints: `/api/onboarding/{status,test,complete,dismiss-hint}` (Plan A); `/api/tasks/{daily,adhoc}`, `/api/tasks`, `/api/tasks/{id}`, `/api/tasks/{id}/stream`, `/api/jobs/spider`, `/api/jobs/{id}/status` (pre-existing, typed in Plan A Task 16).
- FE infra: capabilities store, auth store + refresh queue, axios client, `<AppShell>`, i18n parity.
- Generated types: `src/types/api.gen.ts` covers all the above.

**No main-repo changes in Plan C.** All work is in the new repo.

---

## File map

```
src/
├── api/
│   ├── onboarding.ts            apiOnboardingStatus / Test / Complete / DismissHint
│   ├── tasks.ts                 apiTriggerDaily / TriggerAdhoc / ListTasks / TaskStats / GetTask / GetTaskLog
│   └── jobs.ts                  apiSubmitSpiderJob / GetSpiderJobStatus
├── stores/
│   ├── onboarding.ts            wizard step, filled fields, test results, completion (real impl — B2 stubbed)
│   ├── tasks.ts                 running tasks list + polling (real impl — B2 stubbed)
│   └── runs.ts                  active log-stream subscriptions, deduped by job id
├── composables/
│   ├── useLogStream.ts          poll /api/tasks/{id}/stream with offset, append to buffer (real impl)
│   ├── usePolling.ts            generic polling (real impl)
│   └── useApi.ts                one-shot GET wrapper (real impl)
├── components/
│   ├── onboarding/
│   │   ├── WizardStepper.vue    5-step horizontal stepper with done/active/pending states
│   │   ├── StepWelcome.vue
│   │   ├── StepJavdbSession.vue paste-cookie vs credentials-login tab
│   │   ├── StepQbittorrent.vue  URL + creds + Test button
│   │   ├── StepProxy.vue        mode None/Single/Pool + ProxyPoolEditor + PROXY_MODULES checkboxes
│   │   └── StepFirstRun.vue     "Run test daily (3 pages)" vs "Skip"
│   ├── ProxyPoolEditor.vue      CRUD list of proxy entries (port from Plan A's design sketch)
│   ├── run/
│   │   ├── RunForm.vue          form shell with Standard/Advanced collapsible
│   │   ├── RunCard.vue          running job summary card + log stream embed
│   │   └── LogStreamView.vue    live log viewer with auto-scroll, filter, copy
│   ├── tasks/
│   │   ├── TaskTable.vue        Naive UI NDataTable with filter row
│   │   ├── TaskFilters.vue      status + mode + date range + free-text
│   │   ├── TaskDrawer.vue       full task detail + log when row clicked
│   │   └── StatusBadge.vue      Naive UI NTag with status color tokens
│   └── HintCard.vue             dismissible Dashboard hint
├── pages/
│   ├── OnboardingPage.vue       wraps WizardStepper + the 5 step components
│   ├── RunPage.vue              Daily/Ad Hoc tabs + RunForm + RunCard
│   └── TasksPage.vue            TaskFilters + TaskTable + TaskDrawer
└── router/
    └── routes.ts                + /onboarding, /run, /tasks (with proper meta.layout)
tests/
├── unit/
│   ├── onboarding-store.spec.ts
│   ├── tasks-store.spec.ts
│   ├── use-log-stream.spec.ts
│   ├── use-polling-visibility.spec.ts
│   └── ...
└── e2e/
    ├── onboarding.spec.ts       Journey 1: 5-step wizard incl. test daily
    ├── run-daily.spec.ts        Journey 2: login → dashboard → Run Daily → log
    └── run-adhoc-advanced.spec.ts  Journey 3: Ad Hoc + Advanced spider job
```

---

## Tasks (sequential — each builds on previous)

### Task C1: Onboarding scaffold + standalone route + completion flow

**Outcome:** Visit `/onboarding` (no sidebar) and see an empty 5-step stepper. The first step renders a placeholder "Welcome". Backend `onboarding/status` is consulted on app boot — if `completed === false`, app auto-redirects to `/onboarding` on first login; if true, normal flow. Re-entry button in Settings (placeholder for now).

Land:
- `src/api/onboarding.ts` — typed wrappers calling the 4 BE endpoints.
- `src/stores/onboarding.ts` — real impl: `status` (cached, fetched once at boot), `currentStep` (1-5, persisted to sessionStorage with `useStorage`), `stepValues` (per-step form snapshots), `testResults` (per-component), actions `startOnboarding()` / `completeOnboarding()` / `setStepValue(step, key, val)` / `runTest(component)` / `dismissHint(id)`.
- `src/components/onboarding/WizardStepper.vue` — horizontal stepper from Naive UI `NSteps`. Show ✓ for done, gradient for active, gray for pending. Match the visual mockup from spec session.
- `src/pages/OnboardingPage.vue` — full-screen layout (no sidebar) with the wizard card. Brand mark at top. Footer "Step N of 5". Uses `meta.layout: 'blank'`.
- `src/components/onboarding/StepWelcome.vue` — placeholder with 1-paragraph intro + "Configure now" / "I'll do it later" buttons. The "later" button dismisses to `/` but leaves a banner.
- `src/router/routes.ts` — add `/onboarding` with `meta.layout: 'blank'` (no AppShell wrapper).
- Auto-redirect logic: in `<CapabilitiesGate>`, after capabilities load, call `onboarding.fetchStatus()`. If `!completed && auth.isAuthenticated && route.name !== 'onboarding'`, push to `/onboarding`. Skip auto-redirect if `route.name === 'login'`.
- `tests/unit/onboarding-store.spec.ts` — actions populate state, test results stored per-component, completion sets onboarded=true locally.

Commit: `feat(onboarding): scaffold wizard + standalone route + boot-time redirect`.

### Task C2: Onboarding steps 1-2 (Welcome + JavDB session)

**Outcome:** Step 1 has full Welcome content (paragraph, "Configure now" CTA + "I'll do it later"). Step 2 has a `<NTabs>` with two panels: "Paste cookie" (one input + Test button → calls `onboarding/test` with `component=javdb`) and "Credentials login" (username/password + Test). On success, badge ✓; on failure, badge ✗ + error message. Both step's "Continue" disabled until step is either tested successfully OR explicitly "Skip"'d (Step 2 only).

Land:
- `src/components/onboarding/StepWelcome.vue` — final content per spec §7.2 step 1: 1-paragraph intro, optional ASCII-art / icon diagram (Spider → DB → qB → notifications), three buttons.
- `src/components/onboarding/StepJavdbSession.vue` — NTabs with two tab panels.
  - Tab "Paste cookie": NInput for `_jdb_session` value, NButton "Test connection" → `onboarding.runTest('javdb')` and stores result. On ✓, save `JAVDB_SESSION_COOKIE` to step values.
  - Tab "Login with credentials": NInput username, NInput password, "Test" button → same store action. Note: BE's `onboarding/test` with `component=javdb` just validates the existing cookie env; for credentials it should actually use `/api/login/refresh` to drive a fresh login. Implementer: use `apiLoginRefresh` (existing endpoint) on the credentials path.
- Skip button visible in step 2 only (per spec §7.2 footnote: javdb session is optional for Daily but required for Ad Hoc / actor pages).
- Update i18n keys `onboarding.welcome.*`, `onboarding.javdbSession.*` in all three locales (en/zh-CN/ja).
- `tests/unit/onboarding-step-javdb.spec.ts` — paste-cookie path and credentials path both call the right BE method.

Commit: `feat(onboarding): steps 1-2 (Welcome + JavDB session)`.

### Task C3: Onboarding steps 3-4 (qBittorrent + Proxy)

**Outcome:** Step 3 has URL + username + password + "Allow self-signed certs" checkbox + Test button → calls `onboarding/test` with `component=qb`. Step 4 has proxy mode radio (None / Single / Pool), expanding to either a single URL input or the `ProxyPoolEditor`, plus PROXY_MODULES checkboxes (`spider` / `qbittorrent` / `pikpak` / `all`). Test button → `onboarding/test` with `component=proxy`.

Land:
- `src/components/onboarding/StepQbittorrent.vue` — URL with example placeholder + inline help, username + password (NInput type=password with show toggle), self-signed checkbox. Test button + result badge.
- `src/components/ProxyPoolEditor.vue` — list of proxy entries (name, http, https), add/edit/delete row, drag-to-reorder. Backed by a `v-model` on the parent's array.
- `src/components/onboarding/StepProxy.vue` — NRadioGroup (None / Single / Pool). Conditionally renders either NInput for single, or ProxyPoolEditor. Below: 4 checkboxes for PROXY_MODULES (Spider / qBittorrent / PikPak / All — "All" exclusive with the others).
- i18n keys.
- `tests/unit/proxy-pool-editor.spec.ts` — add row / delete row / reorder behave correctly.

Commit: `feat(onboarding): steps 3-4 (qBittorrent + Proxy with ProxyPoolEditor)`.

### Task C4: Onboarding step 5 (First Run) + completion flow + Home hint cards

**Outcome:** Step 5 offers two buttons — "Run a real daily ingestion now (first 3 pages)" or "Explore the console (skip)". Choosing the first triggers `POST /api/tasks/daily` with `start_page=1, end_page=3` and routes the user to `/tasks` with the new job highlighted. Choosing the second routes to `/` (Home). Either path also calls `POST /api/onboarding/complete`. On Home, render `<HintCard>` for any `skippable_missing` component (e.g., `smtp`, `pikpak`) — dismissible via `POST /api/onboarding/dismiss-hint`.

Land:
- `src/components/onboarding/StepFirstRun.vue` — two CTAs, loading state when "Run now" pressed.
- `src/components/HintCard.vue` — Naive UI NCard with title, body, two buttons (action label, "Dismiss"). Emits `dismiss` event.
- Wire `OnboardingPage.vue` to call `complete()` at step 5 finish, then router push to `/tasks?highlight={jobId}` or `/`.
- Update `HomePage.vue` to render `<HintCard>` instances for each `skippable_missing` from onboarding status. Dismissed hints saved via `dismissHint()`.
- i18n keys.
- `tests/unit/onboarding-step-firstrun.spec.ts` — "Run now" triggers Daily with the right payload; "Skip" goes to Home; both call complete.
- `tests/unit/hint-card.spec.ts` — dismiss emits event + calls API.

Commit: `feat(onboarding): step 5 (first run) + completion + Home hint cards`.

### Task C5: Run page (Daily + Ad Hoc + log streaming)

**Outcome:** `/run` route renders with two tabs (Daily / Ad Hoc). Each tab has a Standard form (compact, just the common fields) and an Advanced collapsible (full `SpiderJobPayload`). Submit launches the task, replaces the form with a `<RunCard>` showing job summary, and embeds `<LogStreamView>` that polls `/api/tasks/{id}/stream` every 2s, appending log lines to a scrolling buffer.

Land:
- `src/api/tasks.ts` — `apiTriggerDaily(payload)` → `POST /api/tasks/daily`; `apiTriggerAdhoc(payload)` → `POST /api/tasks/adhoc`; `apiListTasks(opts)` → `GET /api/tasks`; `apiGetTask(jobId)` → `GET /api/tasks/{job_id}`; `apiGetTaskStream(jobId, offset)` → `GET /api/tasks/{job_id}/stream?offset=`.
- `src/api/jobs.ts` — `apiSubmitSpiderJob(payload)` → `POST /api/jobs/spider`; `apiGetSpiderJobStatus(jobId)`.
- `src/stores/runs.ts` — track currently-streaming job IDs, dedup polls, allow multiple concurrent streams (one per tab/window).
- `src/composables/useLogStream.ts` — real impl: subscribes to a job id, polls every 2s with cursor `offset`, accumulates log lines in a `ref<string[]>`. Pauses on `document.visibilityState === 'hidden'`. Stops when job status reaches a terminal state.
- `src/composables/usePolling.ts` — real impl: generic polling with visibility pause.
- `src/components/run/RunForm.vue` — props: `mode: 'daily' | 'adhoc'`. Standard section + NCollapse "Advanced". Standard fields:
  - Daily: NSwitch dry-run, NSwitch use-proxy, NInputNumber start_page (1-200), NInputNumber end_page (1-200).
  - Ad Hoc: NInput URL, NSwitch dry-run, NSwitch use-proxy, NSwitch ignore_release_date.
  - Advanced (both): NInputNumber phase (1 or 2), NSwitch ignore_history, NInputNumber max_movies_phase1/2, NSwitch enable_dedup, NInputNumber redownload_threshold (0.0-1.0 step 0.05), NSwitch no_rclone_filter, NSwitch disable_all_filters. Each control labelled with its CLI flag in a tooltip.
- "Run on" toggle (Local Worker / GitHub Actions) visible only when `capabilities.ingestion_mode === 'dual'`. Default to `local`.
- On submit: hide RunForm, show `<RunCard>` for the new job id. RunCard contains:
  - Job header (job id, mode, status pill from `<StatusBadge>`, started timestamp, duration ticking).
  - `<LogStreamView>` embedded below.
  - "Start another" button — resets form, hides card.
- `<LogStreamView>` — auto-scroll to bottom (toggleable), free-text filter (highlight + filter), monospace, color-coded by level if log lines have `ERROR/WARN/INFO` prefix. NScrollbar with virtual mode (`useVirtualList` from @vueuse) so a 10k-line log doesn't tank scroll perf.
- `src/pages/RunPage.vue` — NTabs container, RunForm on each tab. After submit, RunForm is replaced by RunCard for the active mode.
- `src/router/routes.ts` — add `/run`.
- Sidebar: wire the "Run" entry to navigate `/run`.
- i18n keys.
- `tests/unit/use-log-stream.spec.ts` — polling appends lines, visibility-pause works, terminal state stops polling.
- `tests/unit/use-polling-visibility.spec.ts` — pause on hidden, resume on visible.
- `tests/unit/run-form.spec.ts` — Daily submit emits correct payload shape; Advanced expand shows all fields.

Commit: `feat(run): Daily/Ad Hoc forms + Standard/Advanced + live log stream`.

### Task C6: Tasks page (list + filters + log drawer)

**Outcome:** `/tasks` route shows a virtualized table of historical task runs. Filter row above with status (multi-select), mode (Local / GitHub), date range, free-text search. Click any row → `<TaskDrawer>` slides in showing the full task metadata + the same `<LogStreamView>` used in Run page (replays from offset 0 for completed tasks; live-streams for running ones).

Land:
- `src/stores/tasks.ts` — real impl: state `{items: TaskItem[], filters, cursor, hasMore, polling}`. Actions `fetchList(reset?)` / `refresh()` / `loadMore()` / `setFilter(key, val)`. Polls every 5s when at least one row is `running`.
- `src/components/tasks/TaskTable.vue` — NDataTable with columns: Job ID (mono), Mode (local/github badge), Status (`<StatusBadge>`), Started (relative time), Duration. Virtualized via NDataTable's `virtual-scroll`. Row click emits select event.
- `src/components/tasks/TaskFilters.vue` — NSelect status (multi), NSelect mode, NDatePicker range, NInput search. v-model:`filters` two-way binding to store.
- `src/components/tasks/StatusBadge.vue` — NTag with status→color mapping: running=info, completed=success, failed=error, etc.
- `src/components/tasks/TaskDrawer.vue` — NDrawer (right, 720px). Top: full job metadata (id, mode, started, duration, ended, error if any, associated SessionId — link to Sessions page in Plan D). Body: `<LogStreamView jobId={id} />`. Live-streams if status is `running`; replays full log otherwise.
- `src/pages/TasksPage.vue` — filters row + table + drawer. Highlights row if URL has `?highlight={jobId}` (used by Onboarding step 5 → Tasks redirect).
- `src/router/routes.ts` — add `/tasks`.
- Sidebar: wire the "Activity / Tasks" sub-item.
- i18n keys.
- `tests/unit/tasks-store.spec.ts` — fetchList populates items, filters narrow the list, polling stops when no running tasks.
- `tests/unit/task-filters.spec.ts` — changing filter triggers store update.

Commit: `feat(tasks): list page with filters + log drawer + virtualized table`.

### Task C7: E2E journeys

**Outcome:** Three Playwright specs cover the new pages end-to-end, against a live BE via docker-compose. Existing `login.spec.ts` is updated to handle the post-login auto-redirect to Onboarding when first-run.

Land:
- `tests/e2e/onboarding.spec.ts` — Journey 1: fresh user (BE seeded with onboarded=false), step through Welcome → JavDB (skip) → qB (with bogus URL, Test fails, skip) → Proxy (None) → First Run "Skip and explore" → Home reachable. Verify `/api/onboarding/complete` was called.
- `tests/e2e/run-daily.spec.ts` — Journey 2: login → dashboard → click "Run Daily" → fill standard form (3 pages dry-run) → submit → see RunCard appear → see log lines appear in LogStreamView within 5s.
- `tests/e2e/run-adhoc-advanced.spec.ts` — Journey 3: login → /run → Ad Hoc tab → expand Advanced → fill URL + ignore_history + max_movies_phase1=5 → submit → RunCard appears.
- Update `tests/e2e/fixtures/auth.ts` (or equivalent) to support seeding `onboarded` state via `/api/test/reset` + a follow-up `/api/onboarding/complete` for already-onboarded test flows.
- Update CI's `e2e.yml` to ensure docker-compose is up + BE seeded before running.

Commit: `test(e2e): journeys 1/2/3 (onboarding, run daily, run adhoc advanced)`.

---

## Verification

After all 7 tasks land:

```bash
npm run lint           # 0 errors
npm run typecheck      # clean
npm run test:unit      # ~25 tests total (Plan B's 10 + new ~15)
npm run test:contract  # 5+ tests
npm run build          # success
# E2E requires docker-compose BE — runs in CI
```

Visual smoke (manual):
1. `npm run dev` + BE running locally.
2. Login → expect auto-redirect to `/onboarding`.
3. Walk all 5 wizard steps; "Skip and explore" at end.
4. Land on Home; sidebar shows Run + Activity/Tasks as navigable.
5. Click Run → fill Daily form → submit → see live log scroll.
6. Click Activity/Tasks → see your just-submitted task in the list.
7. Click the row → drawer opens with full log replay.

---

## Out of scope for Plan C (lands in Plan D/E)

- Sessions page (rollback / commit) — Plan D
- Settings (Config / Auth / Capabilities / Appearance) — Plan D
- Browse page (Resolve / Lists / Preview) — Plan E
- Data (Movies / Torrents) — Phase 2 (post-cutover)
- Operations (qB / PikPak / Rclone / Email / Cleanup) — Phase 2
- Diagnostics (Health / Parse tester / JavDB session) — Phase 2
- GitHub Actions tier `monitor` — Phase 2
- Token refresh proactive notification — Phase 2

---

## Done criteria

- [ ] `/onboarding` walks all 5 steps; completion calls `POST /api/onboarding/complete`.
- [ ] First-time visit auto-redirects to `/onboarding` if `status.completed === false`.
- [ ] `/run` Daily and Ad Hoc tabs both submit valid payloads and stream logs.
- [ ] `/tasks` shows the recent runs; filtering and the log drawer work.
- [ ] All 3 E2E journeys pass in CI.
- [ ] No regression in Plan B unit / contract tests.
- [ ] i18n parity test still passes (all new keys present in zh-CN/en/ja).
