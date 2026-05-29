import type { Env } from "../env";

export interface User {
  username: string;
  role: "admin" | "readonly";
  passwordHash: string;
}

async function loadPasswordHashFromD1(
  db: D1Database,
  key: string,
): Promise<string | null> {
  try {
    const row = await db
      .prepare("SELECT value FROM api_config WHERE key = ?")
      .bind(key)
      .first<{ value: string }>();
    if (!row) return null;
    try {
      return JSON.parse(row.value) as string;
    } catch {
      return row.value;
    }
  } catch {
    return null;
  }
}

export function getUsers(env: Env): User[] {
  const users: User[] = [
    {
      username: env.ADMIN_USERNAME,
      role: "admin",
      passwordHash: env.ADMIN_PASSWORD_HASH,
    },
  ];
  if (env.READONLY_USERNAME && env.READONLY_PASSWORD_HASH) {
    users.push({
      username: env.READONLY_USERNAME,
      role: "readonly",
      passwordHash: env.READONLY_PASSWORD_HASH,
    });
  }
  return users;
}

export async function findUser(
  env: Env,
  db: D1Database,
  username: string,
): Promise<User | undefined> {
  const users = getUsers(env);
  const user = users.find((u) => u.username === username);
  if (!user) return undefined;

  const hashKey =
    user.role === "admin" ? "ADMIN_PASSWORD_HASH" : "READONLY_PASSWORD_HASH";
  const d1Hash = await loadPasswordHashFromD1(db, hashKey);
  if (d1Hash) {
    return { ...user, passwordHash: d1Hash };
  }
  return user;
}
