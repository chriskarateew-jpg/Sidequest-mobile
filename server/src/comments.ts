// Gumpa — comments on quest posts. Flat, no replies. Same visibility model
// as kudos (see handleToggleKudos in feed.ts): any authenticated user who
// has a post id can read/add comments, with no re-check that the post is
// actually visible to them (a private account's friends-only post isn't
// re-verified here) — an existing gap shared with kudos, not new here. As
// with kudos, there's still no moderation, reporting, or blocking layered on
// top, so a comment is exactly as exposed to abuse as a kudos tap is today —
// worth closing before this app carries real public-scale traffic.

import { requireAuth } from './auth';
import type { Env } from './env';
import { error, json, safeJson } from './http';
import { checkRateLimit } from './ratelimit';

const MAX_COMMENT_LENGTH = 500;

interface CommentRow {
  id: string;
  post_id: string;
  user_id: string;
  username: string;
  body: string;
  created_at: number;
}

export async function handleListComments(request: Request, env: Env, postId: string): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (!auth) return error('Not authenticated', 401);

  const post = await env.DB.prepare('SELECT id FROM posts WHERE id = ?').bind(postId).first();
  if (!post) return error('Post not found', 404);

  const { results } = await env.DB.prepare(
    `SELECT post_comments.*, users.username as username FROM post_comments
     JOIN users ON users.id = post_comments.user_id
     WHERE post_id = ? ORDER BY created_at ASC LIMIT 200`
  )
    .bind(postId)
    .all<CommentRow>();

  const comments = (results ?? []).map((row) => ({
    id: row.id,
    username: row.username,
    body: row.body,
    createdAt: row.created_at,
  }));

  return json({ comments });
}

export async function handleAddComment(request: Request, env: Env, postId: string): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (!auth) return error('Not authenticated', 401);

  if (!(await checkRateLimit(env, `comment:${auth.id}`, 30, 3600))) {
    return error('Too many comments. Try again later.', 429);
  }

  const post = await env.DB.prepare('SELECT id FROM posts WHERE id = ?').bind(postId).first();
  if (!post) return error('Post not found', 404);

  const body = await safeJson(request);
  if (!body) return error('Invalid JSON body');

  const text = typeof body.body === 'string' ? body.body.trim().slice(0, MAX_COMMENT_LENGTH) : '';
  if (!text) return error('Comment cannot be empty');

  const id = crypto.randomUUID();
  const createdAt = Date.now();
  await env.DB.prepare('INSERT INTO post_comments (id, post_id, user_id, body, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(id, postId, auth.id, text, createdAt)
    .run();

  return json({ comment: { id, username: auth.username, body: text, createdAt } });
}
