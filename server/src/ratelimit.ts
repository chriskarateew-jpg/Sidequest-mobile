// Gumpa — coarse per-IP rate limiting on auth endpoints. KV reads/writes
// aren't atomic, so this is a deterrent against casual brute-forcing, not a
// hard guarantee — good enough for this scale, not a substitute for
// Cloudflare's own WAF rate-limiting rules if abuse ever gets serious.

import type { Env } from './env';

export function clientIp(request: Request): string {
  return request.headers.get('cf-connecting-ip') ?? 'unknown';
}

export async function checkRateLimit(env: Env, key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const raw = await env.RATE_LIMIT.get(key);
  const count = raw ? parseInt(raw, 10) : 0;
  if (count >= limit) return false;

  await env.RATE_LIMIT.put(key, String(count + 1), { expirationTtl: windowSeconds });
  return true;
}
