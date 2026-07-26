import { requireAuth } from './auth';
import type { Env } from './env';
import { error, json, safeJson } from './http';

export async function handleSetPrivacy(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (!auth) return error('Not authenticated', 401);

  const body = await safeJson(request);
  if (!body || typeof body.isPublic !== 'boolean') return error('Missing isPublic (boolean)');

  await env.DB.prepare('UPDATE users SET is_public = ? WHERE id = ?')
    .bind(body.isPublic ? 1 : 0, auth.id)
    .run();

  return json({ ok: true, isPublic: body.isPublic });
}
