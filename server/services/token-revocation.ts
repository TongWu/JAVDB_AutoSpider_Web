interface SessionEntry {
  jti: string;
  exp: number;
}

export async function revokeToken(kv: KVNamespace, jti: string, ttlSeconds: number): Promise<void> {
  await kv.put(`revoked:${jti}`, "1", { expirationTtl: Math.max(60, ttlSeconds) });
}

export async function isTokenRevoked(kv: KVNamespace, jti: string): Promise<boolean> {
  const val = await kv.get(`revoked:${jti}`);
  return val !== null;
}

export async function trackSession(kv: KVNamespace, username: string, jti: string, exp: number): Promise<void> {
  const key = `sessions:${username}`;
  const raw = await kv.get(key);
  const sessions: SessionEntry[] = raw ? JSON.parse(raw) : [];
  const now = Math.floor(Date.now() / 1000);
  const active = sessions.filter((s) => s.exp > now);
  active.push({ jti, exp });
  const maxExp = Math.max(...active.map((s) => s.exp));
  const ttl = Math.max(60, maxExp - now);
  await kv.put(key, JSON.stringify(active), { expirationTtl: ttl });
}

export async function getSessionCount(kv: KVNamespace, username: string): Promise<number> {
  const key = `sessions:${username}`;
  const raw = await kv.get(key);
  if (!raw) return 0;
  const sessions: SessionEntry[] = JSON.parse(raw);
  const now = Math.floor(Date.now() / 1000);
  return sessions.filter((s) => s.exp > now).length;
}

export async function cleanExpiredSessions(kv: KVNamespace, username: string): Promise<void> {
  const key = `sessions:${username}`;
  const raw = await kv.get(key);
  if (!raw) return;
  const sessions: SessionEntry[] = JSON.parse(raw);
  const now = Math.floor(Date.now() / 1000);
  const active = sessions.filter((s) => s.exp > now);
  if (active.length === 0) {
    await kv.delete(key);
  } else {
    const maxExp = Math.max(...active.map((s) => s.exp));
    await kv.put(key, JSON.stringify(active), { expirationTtl: Math.max(60, maxExp - now) });
  }
}

export async function removeSession(kv: KVNamespace, username: string, jti: string): Promise<void> {
  const key = `sessions:${username}`;
  const raw = await kv.get(key);
  if (!raw) return;
  const sessions: SessionEntry[] = JSON.parse(raw);
  const remaining = sessions.filter((s) => s.jti !== jti);
  if (remaining.length === 0) {
    await kv.delete(key);
  } else {
    const now = Math.floor(Date.now() / 1000);
    const maxExp = Math.max(...remaining.map((s) => s.exp));
    await kv.put(key, JSON.stringify(remaining), { expirationTtl: Math.max(60, maxExp - now) });
  }
}
