// Canonical catalog of ops incident types (ADR-026). Shared so the alerting
// policy panel and the incidents filter stay in sync instead of drifting.
export const OPS_INCIDENT_TYPES = [
  'failed_ingestion',
  'stale_session',
  'proxy_exhaustion',
  'login_failure',
] as const
