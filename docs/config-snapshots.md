# Consumer configuration evidence (ADR-061)

This change pairs with `JAVDB_AutoSpider_CICD` issue #300 and its accepted
`docs/design/ADR-061-Consumer-Config-Job-Snapshots/` design and IMP. The Python
repository owns the OpenAPI contract and the diagnostic D1 migration.

Apply `server/contracts/config_snapshots.sql` to **Operations D1 before deployment**.
It is a byte-identical copy of Python's
`javdb/migrations/d1/2026_09_22_add_config_snapshots.sql`. It creates an insert-only
`ConfigSnapshots` table keyed by `(job_id, consumer)`, with an UPDATE rejection
trigger and fixed 90-day retention. Do not replace existing rows or backfill
historical evidence from current config. The Worker does not create this table
at request time. Daily cron at 03:17 UTC deletes expired rows; reads independently
exclude expiry. No deployment or production migration was performed during implementation.

Admins use Settings → Configuration to inspect current observations or enter a
job ID to retrieve history. The endpoints are:

- `GET /api/config/consumers`: live `observed` evidence, not persistence proof.
- `GET /api/config/job-snapshots/{job_id}`: version 1 retained evidence for
  `api_process`, `cli_accessor`, `launched_job`.

Worker `api_process` evidence combines request-time D1/default resolution with actual dispatch environment bindings. `dispatch-config.ts` resolves `GH_ACTIONS_TIER`, `GH_ACTIONS_TOKEN`, and `GH_ACTIONS_REPO` once per launch; the same result feeds both snapshot capture and the GitHub client. Those fields always use source `environment` (including absent bindings), expose presence only, and override conflicting D1/default observations. The Worker cannot measure the Python CLI or dispatched GitHub
runner: those records are explicitly `unobservable`, with no snapshot/digest.
Python start hooks generate independent evidence for the actual CLI process;
there is no inferred remote-runner correlation. All job-creating route adapters
pass their environment to the central job repository so capture happens before
dispatch and failed capture cannot prevent the existing dispatch path.

Only explicitly reviewed booleans, safe integers and finite enums survive as
values. Credentials, usernames, URLs, proxy/JSON structures, free-form strings,
fractional numbers and unknown fields are presence/source metadata only. Explicit
sensitive metadata overrides any allowlist. Unknown DB keys are not exported.
SHA-256 covers sorted compact JSON of the redacted representation, including
consumer and timestamp; it is not proof of secret equality. The shared synthetic
golden fixture under `server/contracts/config_snapshot_golden.json` pins Python/TS
canonicalization and contains no real credentials.

`captured` requires acknowledged D1 storage. Capture or acknowledgement-read failure
returns `snapshot_unavailable`, emits the constant `config_snapshot snapshot_unavailable`
console error and lets the job continue. A missing/expired row is
`snapshot_unavailable` with `no_retained_evidence`; storage read errors use
`storage_unavailable`. No config values or thrown error text enter these alerts.
A live read is never labelled captured, and frontend read failures clear stale
history and display unavailable evidence. Reads are admin-only even for redacted data.

The two backends intentionally do not share resolution precedence: Python API
uses its config module plus sparse override store; Python `cfg()` records actual
module/caller-default reads; Worker uses its D1 store/default resolver plus the authoritative dispatch environment bindings. Direct
imports, later dynamic reads and external consumers are explicitly outside the
observed scope. Python diagnostic files are not a replacement D1 authority.

## Launch and decode guarantees

All nine remote launch cases use `dispatchJob`: generic `/api/gh-actions/runs`, tasks `/daily` and `/adhoc`, operations `/qb/filter-small`, `/rclone/run`, `/cleanup/stale-sessions`, session rollback, and onboarding `qb`/`proxy`. The shared helper allocates an internal job ID and captures before external dispatch. Receipts include typed `job_id` and `config_snapshot_status`; onboarding additionally retains `details.job_id`. Inline onboarding `javdb` and unsupported `smtp` do not launch jobs. Snapshot failure does not block launch and is never reported as captured.

Reasons are a finite union: `not_observed_in_this_process`, `capture_failed`, `writes_forbidden`, `observation_failed`, `no_retained_evidence`, `storage_unavailable`, `invalid_evidence`. The unreleased migration CHECK accepts captured records only with null reason, and unobservable records only with the fixed reason and null payload/digest. Existing disposable development tables require recreation to receive this new CHECK; this migration has not been deployed to production. Never delete production evidence to retrofit a constraint.

Decoding validates state, the complete canonical redacted representation and its digest before exposing evidence; invalid rows produce unavailable evidence without raw text in responses or logs. The frontend only displays known reasons, provides table captions, and announces successful refresh/lookup in a localized polite live status.

Generic workflow inputs may carry arbitrary credentials. They are sent to the dispatch client but never copied into the new generic job tracking row (`inputs` remains null) or the snapshot.

## Identical replay and blocking I/O

A conflict no-op is not evidence that the attempted snapshot was stored. Both
backends return `captured` only when the retained validated canonical redacted
payload and digest match the attempt, including timestamp. Mismatches return
`snapshot_unavailable` with null payload/digest (`invalid_evidence` in the
repository, `capture_failed` at guarded launch capture) and a constant sanitized
alert. Unobservable writes must also retain the matching unobservable state.
The old row and expiry remain unchanged, and an authorized historical read can
still return that original evidence. This proves no secret equality.

Python diagnostic connections fail fast on a non-CLOSED shared D1 breaker,
without waiting or probing; ordinary storage recovery is unchanged. Diagnostic
HTTP requests keep the three-second transport timeout with no retries, not a
universal DNS/filesystem deadline. Python historical reads use the FastAPI worker
thread pool so blocking D1 I/O cannot stall its event loop. Worker D1 bindings
remain asynchronous.
