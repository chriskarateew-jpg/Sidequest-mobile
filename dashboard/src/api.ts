// Gumpa dashboard — client for the Worker's auth + /admin/* endpoints (see
// server/src/auth.ts, server/src/dev-challenges.ts). The server is the real
// gate (requireDeveloper): a non-developer token gets a plain 404 from every
// /admin/* route, same as hitting a route that doesn't exist.

import type { AdminChallenge, AdminChallengeInput } from './types';

const BASE_URL = import.meta.env.VITE_API_URL as string | undefined;

const TOKEN_KEY = 'gumpa_dashboard_token';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function storeToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

async function apiFetch(path: string, options: { method?: string; body?: unknown; token?: string | null } = {}): Promise<Response> {
  if (!BASE_URL) throw new Error('VITE_API_URL is not configured — see .env.example');

  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (options.token) headers.authorization = `Bearer ${options.token}`;

  return fetch(`${BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; message: string };

async function call<T>(path: string, token: string, options: { method?: string; body?: unknown } = {}): Promise<ApiResult<T>> {
  const res = await apiFetch(path, { ...options, token });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & Partial<T>;
  if (!res.ok) {
    return { ok: false, status: res.status, message: typeof data.error === 'string' ? data.error : `Request failed (${res.status})` };
  }
  return { ok: true, data: data as T };
}

export interface LoginResult {
  token: string;
  user: { id: string; username: string };
}

export async function login(identifier: string, password: string): Promise<ApiResult<LoginResult>> {
  const res = await apiFetch('/auth/login', { method: 'POST', body: { identifier, password } });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return { ok: false, status: res.status, message: typeof data.error === 'string' ? data.error : `Login failed (${res.status})` };
  }
  return { ok: true, data: data as unknown as LoginResult };
}

export function fetchChallenges(token: string) {
  return call<{ challenges: AdminChallenge[] }>('/admin/challenges', token);
}

export function createChallenge(token: string, input: AdminChallengeInput) {
  return call<{ challenge: AdminChallenge; warnings: string[] }>('/admin/challenges', token, { method: 'POST', body: input });
}

export function updateChallenge(token: string, id: string, input: AdminChallengeInput) {
  return call<{ challenge: AdminChallenge; warnings: string[] }>(`/admin/challenges/${id}`, token, { method: 'PATCH', body: input });
}

export function setChallengeActive(token: string, id: string, active: boolean) {
  return call<{ challenge: AdminChallenge }>(`/admin/challenges/${id}`, token, { method: 'PATCH', body: { active } });
}

export function deleteChallenge(token: string, id: string) {
  return call<{ ok: true }>(`/admin/challenges/${id}`, token, { method: 'DELETE' });
}

// Only succeeds once the task is already deactivated — see
// server/src/dev-challenges.ts's handleAdminPermanentlyDeleteChallenge.
export function permanentlyDeleteChallenge(token: string, id: string) {
  return call<{ ok: true }>(`/admin/challenges/${id}/permanent`, token, { method: 'DELETE' });
}

export function previewPrompt(token: string, id: string) {
  return call<{ prompt: string }>(`/admin/challenges/${id}/preview-prompt`, token);
}
