export interface Env {
  // Static assets
  ASSETS: Fetcher;

  // D1 databases
  HISTORY_DB: D1Database;
  REPORTS_DB: D1Database;
  OPERATIONS_DB: D1Database;

  // Auth state (rate limiting, token revocation, session tracking)
  AUTH_KV: KVNamespace;

  // Auth
  API_SECRET_KEY: string;
  ADMIN_USERNAME: string;
  ADMIN_PASSWORD_HASH: string;
  READONLY_USERNAME?: string;
  READONLY_PASSWORD_HASH?: string;

  // Token expiry (seconds)
  ACCESS_TOKEN_EXPIRE_SECONDS?: string;
  REFRESH_TOKEN_EXPIRE_SECONDS?: string;

  // Capabilities
  ENVIRONMENT: string;
  INGESTION_MODE?: string;
  STORAGE_BACKEND?: string;
  DEPLOYMENT?: string;
  BACKEND_VERSION?: string;
  FRONTEND_VERSION?: string;
  GH_ACTIONS_TIER?: string;
  GH_ACTIONS_REPO?: string;
  GH_ACTIONS_TOKEN?: string;
  FEATURE_PIKPAK?: string;
  FEATURE_RCLONE?: string;
  SMTP_HOST?: string;
  SMTP_SERVER?: string;
  JAVDB_USERNAME?: string;

  // Config encryption
  SECRETS_ENCRYPTION_KEY?: string;

  // JavDB session cookie (stored in D1 config, also readable from env for initial seed)
  JAVDB_SESSION_COOKIE?: string;
}
