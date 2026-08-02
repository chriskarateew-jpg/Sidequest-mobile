// Gumpa — the current user's own completed-task history (GET /posts/mine),
// backing the Completed screen (src/app/completed.tsx). Every completed task
// creates exactly one post server-side (see server/src/complete.ts), so this
// is the single source of truth for it — no separate "completed tasks" API.

import { apiFetch } from '@/lib/api';

export interface MyPost {
  id: string;
  questTitle: string;
  questDesc: string;
  photoKey: string | null;
  caption: string | null;
  rating: number | null;
  tokensEarned: number | null;
  createdAt: number;
}

// A discriminated result, not a bare array — a fetch failure (network drop,
// route not deployed yet, server error) must never look identical to "you
// genuinely have zero completed tasks." Collapsing those to the same []
// happened once already here and made a real outage silently render as an
// empty Completed screen with no indication anything was wrong.
export type MyPostsResult = { status: 'ok'; posts: MyPost[] } | { status: 'error' };

export async function fetchMyPosts(token: string): Promise<MyPostsResult> {
  try {
    const res = await apiFetch('/posts/mine', { token });
    if (!res.ok) return { status: 'error' };
    const data = (await res.json()) as { posts?: MyPost[] };
    return { status: 'ok', posts: data.posts ?? [] };
  } catch {
    return { status: 'error' };
  }
}
