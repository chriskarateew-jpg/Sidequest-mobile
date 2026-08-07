import { requireAuth } from './auth';
import type { Env } from './env';
import { CORS_HEADERS, error, json } from './http';

interface PostRow {
  id: string;
  user_id: string;
  username: string;
  quest_title: string;
  quest_desc: string;
  photo_key: string | null;
  caption: string | null;
  rating: number | null;
  tokens_earned: number | null;
  created_at: number;
  kudos_count: number;
  kudos_mine: number;
  comment_count: number;
}

// Completion writes (and the token/duel side effects that go with them) live
// in complete.ts now — this file is reads (feed listing, photo streaming)
// and reactions (kudos) only.

export async function handleListFeed(request: Request, env: Env, scope: 'public' | 'friends'): Promise<Response> {
  // Public feed can be viewed while logged out; friends feed cannot.
  // requireAuth returns null (rather than throwing) when there's no/invalid auth header,
  // so it's safe to call unconditionally and only enforce it for the friends scope.
  const auth = await requireAuth(request, env);
  if (scope === 'friends' && !auth) return error('Not authenticated', 401);

  let query = `SELECT posts.*, users.username as username,
      (SELECT COUNT(*) FROM post_kudos WHERE post_kudos.post_id = posts.id) as kudos_count,
      (SELECT COUNT(*) FROM post_kudos WHERE post_kudos.post_id = posts.id AND post_kudos.user_id = ?) as kudos_mine,
      (SELECT COUNT(*) FROM post_comments WHERE post_comments.post_id = posts.id) as comment_count
    FROM posts JOIN users ON users.id = posts.user_id`;
  const params: unknown[] = [auth?.id ?? ''];

  if (scope === 'friends') {
    query += ` WHERE posts.user_id = ? OR posts.user_id IN (
      SELECT CASE WHEN requester_id = ? THEN recipient_id ELSE requester_id END
      FROM friendships
      WHERE status = 'accepted' AND (requester_id = ? OR recipient_id = ?)
    )`;
    params.push(auth!.id, auth!.id, auth!.id, auth!.id);
  } else {
    // Public feed only ever shows posts from accounts that opted into public sharing —
    // a private account's posts still reach their friends, just not this feed.
    query += ' WHERE users.is_public = 1';
  }

  query += ' ORDER BY posts.created_at DESC LIMIT 40';

  const stmt = env.DB.prepare(query).bind(...params);
  const { results } = await stmt.all<PostRow>();

  const posts = (results ?? []).map((row) => ({
    id: row.id,
    username: row.username,
    questTitle: row.quest_title,
    questDesc: row.quest_desc,
    photoKey: row.photo_key,
    caption: row.caption,
    createdAt: row.created_at,
    kudos: row.kudos_count,
    kudosMine: !!row.kudos_mine,
    comments: row.comment_count,
  }));

  return json({ posts });
}

// The Completed screen's data source — every completed task creates exactly
// one post (see complete.ts), so a user's own posts *are* their completed-task
// history: photo, description, star rating, and coins earned all live here
// already. Unlike the public/friends feed, this includes private-account
// posts (it's the owner looking at their own history) and isn't capped at 40.
export async function handleListMyPosts(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (!auth) return error('Not authenticated', 401);

  const { results } = await env.DB.prepare('SELECT * FROM posts WHERE user_id = ? ORDER BY created_at DESC LIMIT 200')
    .bind(auth.id)
    .all<PostRow>();

  const posts = (results ?? []).map((row) => ({
    id: row.id,
    questTitle: row.quest_title,
    questDesc: row.quest_desc,
    photoKey: row.photo_key,
    caption: row.caption,
    rating: row.rating,
    tokensEarned: row.tokens_earned,
    createdAt: row.created_at,
  }));

  return json({ posts });
}

export async function handleToggleKudos(request: Request, env: Env, postId: string): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (!auth) return error('Not authenticated', 401);

  const post = await env.DB.prepare('SELECT id FROM posts WHERE id = ?').bind(postId).first();
  if (!post) return error('Post not found', 404);

  const existing = await env.DB.prepare('SELECT id FROM post_kudos WHERE post_id = ? AND user_id = ?')
    .bind(postId, auth.id)
    .first<{ id: string }>();

  if (existing) {
    await env.DB.prepare('DELETE FROM post_kudos WHERE id = ?').bind(existing.id).run();
  } else {
    await env.DB.prepare('INSERT INTO post_kudos (id, post_id, user_id, created_at) VALUES (?, ?, ?, ?)')
      .bind(crypto.randomUUID(), postId, auth.id, Date.now())
      .run();
  }

  const { count } = (await env.DB.prepare('SELECT COUNT(*) as count FROM post_kudos WHERE post_id = ?')
    .bind(postId)
    .first<{ count: number }>()) ?? { count: 0 };

  return json({ kudos: count, kudosMine: !existing });
}

// Deletes one of the caller's own posts. Only removes the post/its
// reactions/comments and the underlying R2 photo — deliberately leaves the
// completions row itself (and its already-credited tokens_earned)
// untouched, so deleting a post can't be used to re-earn the same
// challenge in the same period. completions.post_id is a real foreign key
// to posts(id) (migration 0007) and D1 does enforce it, so it has to be
// nulled out before the posts row is deleted — leaving it dangling isn't
// an option like it is for the write-only fields elsewhere, this one
// actively blocks the delete with a constraint failure if skipped.
export async function handleDeletePost(request: Request, env: Env, postId: string): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (!auth) return error('Not authenticated', 401);

  const post = await env.DB.prepare('SELECT id, user_id, photo_key FROM posts WHERE id = ?')
    .bind(postId)
    .first<{ id: string; user_id: string; photo_key: string | null }>();
  // Same id for "doesn't exist" and "exists but isn't yours" — no need to
  // confirm to a caller which is true for someone else's post id.
  if (!post || post.user_id !== auth.id) return error('Not found', 404);

  await env.DB.batch([
    env.DB.prepare('DELETE FROM post_kudos WHERE post_id = ?').bind(postId),
    env.DB.prepare('DELETE FROM post_comments WHERE post_id = ?').bind(postId),
    env.DB.prepare('UPDATE completions SET post_id = NULL WHERE post_id = ?').bind(postId),
    env.DB.prepare('DELETE FROM posts WHERE id = ?').bind(postId),
  ]);

  if (post.photo_key) await env.PHOTOS.delete(post.photo_key);

  return json({ ok: true });
}

export async function handleGetPhoto(env: Env, key: string): Promise<Response> {
  const object = await env.PHOTOS.get(key);
  if (!object) return new Response('Not found', { status: 404, headers: CORS_HEADERS });

  return new Response(object.body as unknown as BodyInit, {
    headers: {
      'content-type': object.httpMetadata?.contentType ?? 'image/jpeg',
      'cache-control': 'public, max-age=31536000, immutable',
      ...CORS_HEADERS,
    },
  });
}

