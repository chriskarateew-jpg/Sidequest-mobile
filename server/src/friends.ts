import { requireAuth } from './auth';
import type { Env } from './env';
import { error, json, safeJson } from './http';

export async function handleSearchUsers(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (!auth) return error('Not authenticated', 401);

  const url = new URL(request.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  if (q.length < 2) return json({ users: [] });

  const { results } = await env.DB.prepare('SELECT id, username FROM users WHERE username LIKE ? AND id != ? LIMIT 20')
    .bind(`%${q}%`, auth.id)
    .all<{ id: string; username: string }>();

  const users = [];
  for (const u of results ?? []) {
    const rel = await env.DB.prepare(
      'SELECT status, requester_id FROM friendships WHERE (requester_id = ? AND recipient_id = ?) OR (requester_id = ? AND recipient_id = ?)'
    )
      .bind(auth.id, u.id, u.id, auth.id)
      .first<{ status: string; requester_id: string }>();

    let status: 'none' | 'pending_outgoing' | 'pending_incoming' | 'friends' = 'none';
    if (rel) {
      if (rel.status === 'accepted') status = 'friends';
      else status = rel.requester_id === auth.id ? 'pending_outgoing' : 'pending_incoming';
    }
    users.push({ id: u.id, username: u.username, status });
  }

  return json({ users });
}

export async function handleFriendRequest(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (!auth) return error('Not authenticated', 401);

  const body = await safeJson(request);
  const toUserId = String(body?.toUserId ?? '');
  if (!toUserId || toUserId === auth.id) return error('Invalid target user');

  const target = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(toUserId).first();
  if (!target) return error('User not found', 404);

  const existing = await env.DB.prepare(
    'SELECT id FROM friendships WHERE (requester_id = ? AND recipient_id = ?) OR (requester_id = ? AND recipient_id = ?)'
  )
    .bind(auth.id, toUserId, toUserId, auth.id)
    .first();
  if (existing) return error('A request already exists between you and this user', 409);

  const id = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO friendships (id, requester_id, recipient_id, status, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(id, auth.id, toUserId, 'pending', Date.now())
    .run();

  return json({ ok: true });
}

export async function handleFriendRespond(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (!auth) return error('Not authenticated', 401);

  const body = await safeJson(request);
  const requestId = String(body?.requestId ?? '');
  const accept = !!body?.accept;
  if (!requestId) return error('Missing requestId');

  const row = await env.DB.prepare('SELECT id FROM friendships WHERE id = ? AND recipient_id = ?')
    .bind(requestId, auth.id)
    .first<{ id: string }>();
  if (!row) return error('Request not found', 404);

  if (accept) {
    await env.DB.prepare("UPDATE friendships SET status = 'accepted' WHERE id = ?").bind(requestId).run();
  } else {
    await env.DB.prepare('DELETE FROM friendships WHERE id = ?').bind(requestId).run();
  }
  return json({ ok: true });
}

export async function handleListFriends(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (!auth) return error('Not authenticated', 401);

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  const { results: accepted } = await env.DB.prepare(
    `SELECT friendships.id, users.id as user_id, users.username,
        (SELECT COUNT(*) FROM posts WHERE posts.user_id = users.id AND posts.created_at >= ?) as weekly_posts
     FROM friendships
     JOIN users ON users.id = CASE WHEN requester_id = ? THEN recipient_id ELSE requester_id END
     WHERE status = 'accepted' AND (requester_id = ? OR recipient_id = ?)
     ORDER BY weekly_posts DESC`
  )
    .bind(weekAgo, auth.id, auth.id, auth.id)
    .all<{ id: string; user_id: string; username: string; weekly_posts: number }>();

  const { results: incoming } = await env.DB.prepare(
    `SELECT friendships.id, users.id as user_id, users.username
     FROM friendships
     JOIN users ON users.id = friendships.requester_id
     WHERE status = 'pending' AND recipient_id = ?`
  )
    .bind(auth.id)
    .all<{ id: string; user_id: string; username: string }>();

  return json({
    friends: (accepted ?? []).map((f) => ({ id: f.id, user_id: f.user_id, username: f.username, weeklyPosts: f.weekly_posts })),
    incomingRequests: incoming ?? [],
  });
}
