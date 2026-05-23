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
  "SMTP_PASSWORD",
  "JAVDB_PASSWORD",
  "JAVDB_SESSION_COOKIE",
  "GPT_API_KEY",
  "PIKPAK_PASSWORD",
  "PROXY_POOL",
]);

export const CONFIG_META_FIELDS: ConfigFieldMeta[] = [
  { key: "ADMIN_USERNAME", section: "apiConsole", type: "string", sensitive: false, readonly: true },
  { key: "API_SECRET_KEY", section: "apiConsole", type: "string", sensitive: true, readonly: true },
  { key: "QB_URL", section: "qbittorrent", type: "string", sensitive: false, readonly: false },
  { key: "QB_USERNAME", section: "qbittorrent", type: "string", sensitive: false, readonly: false },
  { key: "QB_PASSWORD", section: "qbittorrent", type: "string", sensitive: true, readonly: false },
  { key: "QB_VERIFY_TLS", section: "qbittorrent", type: "bool", sensitive: false, readonly: false },
  { key: "TORRENT_CATEGORY", section: "qbittorrent", type: "string", sensitive: false, readonly: false },
  { key: "TORRENT_CATEGORY_ADHOC", section: "qbittorrent", type: "string", sensitive: false, readonly: false },
  { key: "TORRENT_SAVE_PATH", section: "qbittorrent", type: "string", sensitive: false, readonly: false },
  { key: "AUTO_START", section: "qbittorrent", type: "bool", sensitive: false, readonly: false },
  { key: "SKIP_CHECKING", section: "qbittorrent", type: "bool", sensitive: false, readonly: false },
  { key: "MIN_FILE_SIZE_MB", section: "qbFileFilter", type: "int", sensitive: false, readonly: false },
  { key: "JAVDB_SESSION_COOKIE", section: "javdb", type: "string", sensitive: true, readonly: false },
  { key: "JAVDB_USERNAME", section: "javdb", type: "string", sensitive: false, readonly: false },
  { key: "JAVDB_PASSWORD", section: "javdb", type: "string", sensitive: true, readonly: false },
  { key: "PROXY_MODE", section: "proxy", type: "string", sensitive: false, readonly: false },
  { key: "PROXY_HTTP", section: "proxy", type: "string", sensitive: false, readonly: false },
  { key: "PROXY_POOL", section: "proxy", type: "json", sensitive: true, readonly: false },
  { key: "PROXY_MODULES", section: "proxy", type: "json", sensitive: false, readonly: false },
  { key: "USE_PROXY", section: "spider", type: "bool", sensitive: false, readonly: false },
  { key: "START_PAGE", section: "spider", type: "int", sensitive: false, readonly: false },
  { key: "END_PAGE", section: "spider", type: "int", sensitive: false, readonly: false },
  { key: "MOVIE_SLEEP_MIN", section: "timing", type: "float", sensitive: false, readonly: false },
  { key: "MOVIE_SLEEP_MAX", section: "timing", type: "float", sensitive: false, readonly: false },
  { key: "PAGE_SLEEP", section: "timing", type: "float", sensitive: false, readonly: false },
  { key: "SMTP_HOST", section: "smtp", type: "string", sensitive: false, readonly: false },
  { key: "SMTP_PORT", section: "smtp", type: "int", sensitive: false, readonly: false },
  { key: "SMTP_USER", section: "smtp", type: "string", sensitive: false, readonly: false },
  { key: "SMTP_PASSWORD", section: "smtp", type: "string", sensitive: true, readonly: false },
  { key: "PIKPAK_EMAIL", section: "pikpak", type: "string", sensitive: false, readonly: false },
  { key: "PIKPAK_PASSWORD", section: "pikpak", type: "string", sensitive: true, readonly: false },
  { key: "RCLONE_REMOTE", section: "rclone", type: "string", sensitive: false, readonly: false },
  { key: "RCLONE_FOLDER_PATH", section: "rclone", type: "string", sensitive: false, readonly: false },
  { key: "GIT_USERNAME", section: "git", type: "string", sensitive: false, readonly: false },
  { key: "GIT_PASSWORD", section: "git", type: "string", sensitive: true, readonly: false },
  { key: "GPT_API_KEY", section: "advanced", type: "string", sensitive: true, readonly: false },
];

export const CONFIG_DEFAULTS: Record<string, unknown> = {};
for (const field of CONFIG_META_FIELDS) {
  if (field.type === "bool") CONFIG_DEFAULTS[field.key] = false;
  else if (field.type === "int") CONFIG_DEFAULTS[field.key] = 0;
  else if (field.type === "float") CONFIG_DEFAULTS[field.key] = 0.0;
  else if (field.type === "json") CONFIG_DEFAULTS[field.key] = field.key === "PROXY_POOL" ? [] : {};
  else CONFIG_DEFAULTS[field.key] = "";
}
