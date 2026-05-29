export interface ConfigFieldMeta {
  key: string;
  section: string;
  type: "bool" | "int" | "float" | "json" | "string";
  sensitive: boolean;
  readonly: boolean;
}

export const SENSITIVE_KEYS = new Set([
  "GIT_PASSWORD",
  "QB_PASSWORD",
  "QB_PASSWORD_ADHOC",
  "SMTP_PASSWORD",
  "JAVDB_PASSWORD",
  "JAVDB_SESSION_COOKIE",
  "GPT_API_KEY",
  "GH_ACTIONS_TOKEN",
  "PIKPAK_PASSWORD",
  "PROXY_POOL",
  "READONLY_PASSWORD_HASH",
]);

export const ALIAS_MAP: Record<string, string> = {
  SMTP_SERVER: "SMTP_HOST",
  PAGE_START: "START_PAGE",
  PAGE_END: "END_PAGE",
};

export const CONFIG_META_FIELDS: ConfigFieldMeta[] = [
  // --- apiConsole ---
  { key: "ADMIN_USERNAME", section: "apiConsole", type: "string", sensitive: false, readonly: true },
  { key: "API_SECRET_KEY", section: "apiConsole", type: "string", sensitive: true, readonly: true },
  { key: "READONLY_USERNAME", section: "apiConsole", type: "string", sensitive: false, readonly: false },
  { key: "READONLY_PASSWORD_HASH", section: "apiConsole", type: "string", sensitive: true, readonly: false },

  // --- qbittorrent ---
  { key: "QB_URL", section: "qbittorrent", type: "string", sensitive: false, readonly: false },
  { key: "QB_USERNAME", section: "qbittorrent", type: "string", sensitive: false, readonly: false },
  { key: "QB_PASSWORD", section: "qbittorrent", type: "string", sensitive: true, readonly: false },
  { key: "QB_VERIFY_TLS", section: "qbittorrent", type: "bool", sensitive: false, readonly: false },
  { key: "TORRENT_CATEGORY", section: "qbittorrent", type: "string", sensitive: false, readonly: false },
  { key: "TORRENT_CATEGORY_ADHOC", section: "qbittorrent", type: "string", sensitive: false, readonly: false },
  { key: "TORRENT_SAVE_PATH", section: "qbittorrent", type: "string", sensitive: false, readonly: false },
  { key: "AUTO_START", section: "qbittorrent", type: "bool", sensitive: false, readonly: false },
  { key: "SKIP_CHECKING", section: "qbittorrent", type: "bool", sensitive: false, readonly: false },
  { key: "QB_URL_ADHOC", section: "qbittorrent", type: "string", sensitive: false, readonly: false },
  { key: "QB_USERNAME_ADHOC", section: "qbittorrent", type: "string", sensitive: false, readonly: false },
  { key: "QB_PASSWORD_ADHOC", section: "qbittorrent", type: "string", sensitive: true, readonly: false },
  { key: "QB_ALLOW_INSECURE_HTTP", section: "qbittorrent", type: "bool", sensitive: false, readonly: true },
  { key: "REQUEST_TIMEOUT", section: "qbittorrent", type: "int", sensitive: false, readonly: false },
  { key: "DELAY_BETWEEN_ADDITIONS", section: "qbittorrent", type: "int", sensitive: false, readonly: false },

  // --- qbFileFilter ---
  { key: "MIN_FILE_SIZE_MB", section: "qbFileFilter", type: "int", sensitive: false, readonly: false },

  // --- javdb ---
  { key: "JAVDB_SESSION_COOKIE", section: "javdb", type: "string", sensitive: true, readonly: false },
  { key: "JAVDB_USERNAME", section: "javdb", type: "string", sensitive: false, readonly: false },
  { key: "JAVDB_PASSWORD", section: "javdb", type: "string", sensitive: true, readonly: false },
  { key: "GPT_API_URL", section: "javdb", type: "string", sensitive: false, readonly: false },
  { key: "GPT_API_KEY", section: "javdb", type: "string", sensitive: true, readonly: false },
  { key: "LOGIN_ATTEMPTS_PER_PROXY_LIMIT", section: "javdb", type: "int", sensitive: false, readonly: false },
  { key: "LOGIN_MAX_FAILURES_BEFORE_PROXY_SWITCH", section: "javdb", type: "int", sensitive: false, readonly: false },
  { key: "LOGIN_VERIFICATION_URLS", section: "javdb", type: "json", sensitive: false, readonly: false },

  // --- proxy ---
  { key: "PROXY_MODE", section: "proxy", type: "string", sensitive: false, readonly: false },
  { key: "PROXY_HTTP", section: "proxy", type: "string", sensitive: false, readonly: false },
  { key: "PROXY_POOL", section: "proxy", type: "json", sensitive: true, readonly: false },
  { key: "PROXY_MODULES", section: "proxy", type: "json", sensitive: false, readonly: false },
  { key: "PROXY_POOL_MAX_FAILURES", section: "proxy", type: "int", sensitive: false, readonly: false },
  { key: "LOGIN_PROXY_NAME", section: "proxy", type: "string", sensitive: false, readonly: false },

  // --- spider ---
  { key: "USE_PROXY", section: "spider", type: "bool", sensitive: false, readonly: false },
  { key: "PAGE_START", section: "spider", type: "int", sensitive: false, readonly: false },
  { key: "PAGE_END", section: "spider", type: "int", sensitive: false, readonly: false },
  { key: "PHASE2_MIN_RATE", section: "spider", type: "float", sensitive: false, readonly: false },
  { key: "PHASE2_MIN_COMMENTS", section: "spider", type: "int", sensitive: false, readonly: false },
  { key: "BASE_URL", section: "spider", type: "string", sensitive: false, readonly: false },

  // --- timing ---
  { key: "MOVIE_SLEEP_MIN", section: "timing", type: "float", sensitive: false, readonly: false },
  { key: "MOVIE_SLEEP_MAX", section: "timing", type: "float", sensitive: false, readonly: false },
  { key: "PAGE_SLEEP", section: "timing", type: "float", sensitive: false, readonly: false },

  // --- smtp ---
  { key: "SMTP_SERVER", section: "smtp", type: "string", sensitive: false, readonly: false },
  { key: "SMTP_PORT", section: "smtp", type: "int", sensitive: false, readonly: false },
  { key: "SMTP_USER", section: "smtp", type: "string", sensitive: false, readonly: false },
  { key: "SMTP_PASSWORD", section: "smtp", type: "string", sensitive: true, readonly: false },
  { key: "EMAIL_FROM", section: "smtp", type: "string", sensitive: false, readonly: false },
  { key: "EMAIL_TO", section: "smtp", type: "string", sensitive: false, readonly: false },

  // --- pikpak ---
  { key: "PIKPAK_EMAIL", section: "pikpak", type: "string", sensitive: false, readonly: false },
  { key: "PIKPAK_PASSWORD", section: "pikpak", type: "string", sensitive: true, readonly: false },

  // --- rclone ---
  { key: "RCLONE_REMOTE", section: "rclone", type: "string", sensitive: false, readonly: false },
  { key: "RCLONE_FOLDER_PATH", section: "rclone", type: "string", sensitive: false, readonly: false },

  // --- git ---
  { key: "GIT_USERNAME", section: "git", type: "string", sensitive: false, readonly: false },
  { key: "GIT_PASSWORD", section: "git", type: "string", sensitive: true, readonly: false },

  // --- ghActions ---
  { key: "GH_ACTIONS_TIER", section: "ghActions", type: "string", sensitive: false, readonly: true },
  { key: "GH_ACTIONS_REPO", section: "ghActions", type: "string", sensitive: false, readonly: true },
  { key: "GH_ACTIONS_TOKEN", section: "ghActions", type: "string", sensitive: true, readonly: false },
];

export const CONFIG_DEFAULTS: Record<string, unknown> = {};
for (const field of CONFIG_META_FIELDS) {
  if (field.type === "bool") CONFIG_DEFAULTS[field.key] = false;
  else if (field.type === "int") CONFIG_DEFAULTS[field.key] = 0;
  else if (field.type === "float") CONFIG_DEFAULTS[field.key] = 0.0;
  else if (field.type === "json") {
    if (field.key === "PROXY_POOL") CONFIG_DEFAULTS[field.key] = [];
    else if (field.key === "LOGIN_VERIFICATION_URLS") CONFIG_DEFAULTS[field.key] = [];
    else CONFIG_DEFAULTS[field.key] = {};
  } else {
    if (field.key === "BASE_URL") CONFIG_DEFAULTS[field.key] = "https://javdb.com";
    else if (field.key === "PROXY_POOL_MAX_FAILURES") CONFIG_DEFAULTS[field.key] = 3;
    else if (field.key === "LOGIN_ATTEMPTS_PER_PROXY_LIMIT") CONFIG_DEFAULTS[field.key] = 6;
    else if (field.key === "LOGIN_MAX_FAILURES_BEFORE_PROXY_SWITCH") CONFIG_DEFAULTS[field.key] = 3;
    else CONFIG_DEFAULTS[field.key] = "";
  }
}
