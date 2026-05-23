import { SENSITIVE_KEYS, CONFIG_DEFAULTS } from "./config-schema";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function deriveKey(secret: string): Promise<CryptoKey> {
  const raw = encoder.encode(secret);
  const keyMaterial = await crypto.subtle.importKey("raw", raw, "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: encoder.encode("javdb-config-store"), iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encrypt(plaintext: string, secret: string): Promise<string> {
  const key = await deriveKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(plaintext));
  return JSON.stringify({
    enc: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
    iv: btoa(String.fromCharCode(...iv)),
  });
}

async function decrypt(stored: string, secret: string): Promise<string> {
  const { enc, iv } = JSON.parse(stored);
  const key = await deriveKey(secret);
  const ciphertext = Uint8Array.from(atob(enc), (c) => c.charCodeAt(0));
  const ivBytes = Uint8Array.from(atob(iv), (c) => c.charCodeAt(0));
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ivBytes }, key, ciphertext);
  return decoder.decode(plaintext);
}

function isEncrypted(value: string): boolean {
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && "enc" in parsed && "iv" in parsed;
  } catch {
    return false;
  }
}

export async function loadConfigStore(
  db: D1Database,
  encryptionKey?: string,
): Promise<Record<string, unknown>> {
  const rows = await db.prepare("SELECT key, value FROM api_config").all<{ key: string; value: string }>();
  const result: Record<string, unknown> = {};
  for (const row of rows.results) {
    if (encryptionKey && isEncrypted(row.value)) {
      try {
        const decrypted = await decrypt(row.value, encryptionKey);
        result[row.key] = JSON.parse(decrypted);
      } catch {
        // Cannot decrypt — skip this key
      }
    } else {
      try {
        result[row.key] = JSON.parse(row.value);
      } catch {
        result[row.key] = row.value;
      }
    }
  }
  return result;
}

export async function saveConfigKeys(
  db: D1Database,
  updates: Record<string, unknown>,
  encryptionKey?: string,
): Promise<void> {
  for (const [key, value] of Object.entries(updates)) {
    let serialized: string;
    const jsonValue = JSON.stringify(value);
    if (encryptionKey && SENSITIVE_KEYS.has(key)) {
      serialized = await encrypt(jsonValue, encryptionKey);
    } else {
      serialized = jsonValue;
    }
    await db
      .prepare(
        `INSERT INTO api_config (key, value, updated_at) VALUES (?, ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
      )
      .bind(key, serialized)
      .run();
  }
}

export function maskConfig(config: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    if (SENSITIVE_KEYS.has(key)) {
      result[key] = value ? "********" : "";
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function mergeWithDefaults(storeValues: Record<string, unknown>): Record<string, unknown> {
  return { ...CONFIG_DEFAULTS, ...storeValues };
}
