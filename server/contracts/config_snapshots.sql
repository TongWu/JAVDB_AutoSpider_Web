-- Write-Class: diagnostic
-- Apply with:
--   wrangler d1 execute javdb-operations --remote \
--     --file=javdb/migrations/d1/2026_09_22_add_config_snapshots.sql
-- ADR-061: apply to operations D1 before deploying snapshot consumers.
CREATE TABLE IF NOT EXISTS ConfigSnapshots (
    job_id TEXT NOT NULL,
    consumer TEXT NOT NULL CHECK (consumer IN ('api_process', 'cli_accessor', 'launched_job')),
    captured_at TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('captured', 'unobservable')),
    reason TEXT,
    snapshot_json TEXT,
    digest TEXT,
    PRIMARY KEY (job_id, consumer),
    CHECK ((status = 'captured' AND reason IS NULL AND snapshot_json IS NOT NULL AND digest IS NOT NULL)
        OR (status = 'unobservable' AND reason IS NOT NULL AND reason = 'not_observed_in_this_process' AND snapshot_json IS NULL AND digest IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_config_snapshots_expiry ON ConfigSnapshots(expires_at);
CREATE TRIGGER IF NOT EXISTS config_snapshots_immutable
BEFORE UPDATE ON ConfigSnapshots
BEGIN
    SELECT RAISE(ABORT, 'ConfigSnapshots are immutable');
END;
