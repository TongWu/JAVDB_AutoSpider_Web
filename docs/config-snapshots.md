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

Worker `api_process` evidence measures request-time D1/default resolution, including
alias fallback. The Worker cannot measure the Python CLI or dispatched GitHub
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
module/caller-default reads; Worker uses its D1 store/default resolver. Direct
imports, later dynamic reads and external consumers are explicitly outside the
observed scope. Python diagnostic files are not a replacement D1 authority.
