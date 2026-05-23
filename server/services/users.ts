import type { Env } from "../env";

export interface User {
  username: string;
  role: "admin" | "readonly";
  passwordHash: string;
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

export function findUser(env: Env, username: string): User | undefined {
  return getUsers(env).find((u) => u.username === username);
}
