import { requireAuth } from './auth';
import type { Env } from './env';
import { base64ToBytes, error, json, safeJson } from './http';

const INVITE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I — easier to read aloud/type

function generateInviteCode(): string {
  let code = '';
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  for (const b of bytes) code += INVITE_CHARS[b % INVITE_CHARS.length];
  return code;
}

export async function handleCreateGroup(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (!auth) return error('Not authenticated', 401);

  const body = await safeJson(request);
  const name = String(body?.name ?? '').trim();
  if (!name || name.length > 40) return error('Group name must be 1-40 characters');

  const location = String(body?.location ?? '').trim().slice(0, 60) || null;
  const pictureBase64 = body?.pictureBase64 as string | undefined;
  const mediaType = (body?.mediaType as string | undefined) ?? 'image/jpeg';

  const id = crypto.randomUUID();
  const inviteCode = generateInviteCode();
  const createdAt = Date.now();

  let pictureKey: string | null = null;
  if (pictureBase64) {
    const ext = mediaType.includes('png') ? 'png' : 'jpg';
    pictureKey = `groups/${id}.${ext}`;
    await env.PHOTOS.put(pictureKey, base64ToBytes(pictureBase64), { httpMetadata: { contentType: mediaType } });
  }

  await env.DB.prepare(
    'INSERT INTO groups (id, name, invite_code, created_by, created_at, picture_key, location) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(id, name, inviteCode, auth.id, createdAt, pictureKey, location)
    .run();

  await env.DB.prepare('INSERT INTO group_members (id, group_id, user_id, joined_at) VALUES (?, ?, ?, ?)')
    .bind(crypto.randomUUID(), id, auth.id, createdAt)
    .run();

  return json({ group: { id, name, inviteCode, memberCount: 1, pictureKey, location } });
}

export async function handleJoinGroup(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (!auth) return error('Not authenticated', 401);

  const body = await safeJson(request);
  const inviteCode = String(body?.inviteCode ?? '')
    .trim()
    .toUpperCase();
  if (!inviteCode) return error('Missing invite code');

  const group = await env.DB.prepare('SELECT id, name FROM groups WHERE invite_code = ?')
    .bind(inviteCode)
    .first<{ id: string; name: string }>();
  if (!group) return error('No group found with that invite code', 404);

  const existing = await env.DB.prepare('SELECT id FROM group_members WHERE group_id = ? AND user_id = ?')
    .bind(group.id, auth.id)
    .first();
  if (!existing) {
    await env.DB.prepare('INSERT INTO group_members (id, group_id, user_id, joined_at) VALUES (?, ?, ?, ?)')
      .bind(crypto.randomUUID(), group.id, auth.id, Date.now())
      .run();
  }

  return json({ group: { id: group.id, name: group.name } });
}

export async function handleListMyGroups(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (!auth) return error('Not authenticated', 401);

  const { results } = await env.DB.prepare(
    `SELECT groups.id, groups.name, groups.invite_code, groups.picture_key, groups.location,
        (SELECT COUNT(*) FROM group_members gm2 WHERE gm2.group_id = groups.id) as member_count
     FROM group_members
     JOIN groups ON groups.id = group_members.group_id
     WHERE group_members.user_id = ?
     ORDER BY groups.created_at DESC`
  )
    .bind(auth.id)
    .all<{ id: string; name: string; invite_code: string; picture_key: string | null; location: string | null; member_count: number }>();

  return json({
    groups: (results ?? []).map((g) => ({
      id: g.id,
      name: g.name,
      inviteCode: g.invite_code,
      pictureKey: g.picture_key,
      location: g.location,
      memberCount: g.member_count,
    })),
  });
}

export async function handleGetGroup(request: Request, env: Env, groupId: string): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (!auth) return error('Not authenticated', 401);

  const membership = await env.DB.prepare('SELECT id FROM group_members WHERE group_id = ? AND user_id = ?')
    .bind(groupId, auth.id)
    .first();
  if (!membership) return error('Not a member of this group', 403);

  const group = await env.DB.prepare('SELECT id, name, invite_code, picture_key, location FROM groups WHERE id = ?')
    .bind(groupId)
    .first<{ id: string; name: string; invite_code: string; picture_key: string | null; location: string | null }>();
  if (!group) return error('Group not found', 404);

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const { results: members } = await env.DB.prepare(
    `SELECT users.id as user_id, users.username,
        (SELECT COUNT(*) FROM posts WHERE posts.user_id = users.id AND posts.created_at >= ?) as weekly_posts
     FROM group_members
     JOIN users ON users.id = group_members.user_id
     WHERE group_members.group_id = ?
     ORDER BY weekly_posts DESC`
  )
    .bind(weekAgo, groupId)
    .all<{ user_id: string; username: string; weekly_posts: number }>();

  return json({
    group: {
      id: group.id,
      name: group.name,
      inviteCode: group.invite_code,
      pictureKey: group.picture_key,
      location: group.location,
      members: (members ?? []).map((m) => ({ userId: m.user_id, username: m.username, weeklyPosts: m.weekly_posts })),
    },
  });
}
