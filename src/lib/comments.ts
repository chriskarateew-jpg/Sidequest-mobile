// Gumpa — comments on a quest post (GET/POST /posts/:id/comments).

import { apiFetch } from '@/lib/api';

export interface Comment {
  id: string;
  username: string;
  body: string;
  createdAt: number;
}

export async function fetchComments(postId: string, token: string | null): Promise<Comment[]> {
  try {
    const res = await apiFetch(`/posts/${postId}/comments`, { token });
    if (!res.ok) return [];
    const data = (await res.json()) as { comments?: Comment[] };
    return data.comments ?? [];
  } catch {
    return [];
  }
}

export async function postComment(postId: string, body: string, token: string): Promise<Comment | null> {
  try {
    const res = await apiFetch(`/posts/${postId}/comments`, { method: 'POST', token, body: { body } });
    if (!res.ok) return null;
    const data = (await res.json()) as { comment?: Comment };
    return data.comment ?? null;
  } catch {
    return null;
  }
}
