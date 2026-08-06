// Gumpa — client for the developer-only /admin/* endpoints (see
// server/src/dev-challenges.ts, server/src/boosts.ts,
// server/src/timed-challenges.ts). Used only by the hidden /dev screens. The
// server is the real gate (requireDeveloper) — a non-developer token gets a
// plain 404 here, same as any other unmatched route, which callers should
// treat as "this doesn't exist" rather than "access denied."
//
// Naming note: AdminChallenge/AdminChallengeInput below refer to what the
// dev-panel UI labels as "Task" (recurring, cadence-based) — the internal
// name is unchanged from before this distinction existed. AdminTimedChallenge
// is the new time-boxed "Challenge" concept, kept separate throughout.

import { apiFetch } from '@/lib/api';
import type { Cadence, ProofType, VerifyMethod } from '@/lib/data';

export interface AdminChallenge {
  id: string;
  title: string;
  desc: string;
  tokens: number;
  cadence: Cadence;
  cat: string;
  verify: VerifyMethod;
  proofType: ProofType;
  streakTarget: number | null;
  placeLat: number | null;
  placeLng: number | null;
  radiusMeters: number | null;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface AdminChallengeInput {
  title: string;
  desc: string;
  tokens: number;
  cadence: Cadence;
  cat: string;
  verify: VerifyMethod;
  proofType: ProofType;
  streakTarget?: number;
  placeLat?: number;
  placeLng?: number;
  radiusMeters?: number;
}

export interface AdminBoost {
  id: string;
  challengeId: string;
  challengeTitle: string | null;
  boostedTokens: number;
  startsAt: number;
  endsAt: number;
  cancelledAt: number | null;
  createdAt: number;
}

export interface AdminTimedChallenge {
  id: string;
  title: string;
  desc: string;
  tokens: number;
  cat: string;
  proofType: ProofType;
  durationMinutes: number;
  placeLat: number | null;
  placeLng: number | null;
  radiusMeters: number | null;
  active: boolean;
  deadlineAt: number;
  createdAt: number;
  updatedAt: number;
}

export interface AdminTimedChallengeInput {
  title: string;
  desc: string;
  tokens: number;
  cat: string;
  proofType: ProofType;
  durationMinutes: number;
  placeLat?: number;
  placeLng?: number;
  radiusMeters?: number;
}

export type AdminResult<T> = { ok: true; data: T } | { ok: false; status: number; message: string };

async function callAdmin<T>(path: string, token: string, options: { method?: string; body?: unknown } = {}): Promise<AdminResult<T>> {
  const res = await apiFetch(path, { ...options, token });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & Partial<T>;
  if (!res.ok) {
    return { ok: false, status: res.status, message: typeof data.error === 'string' ? data.error : `Request failed (${res.status})` };
  }
  return { ok: true, data: data as T };
}

export function fetchAdminChallenges(token: string) {
  return callAdmin<{ challenges: AdminChallenge[] }>('/admin/challenges', token);
}

export function createAdminChallenge(token: string, input: AdminChallengeInput) {
  return callAdmin<{ challenge: AdminChallenge }>('/admin/challenges', token, { method: 'POST', body: input });
}

export function updateAdminChallenge(token: string, id: string, input: AdminChallengeInput) {
  return callAdmin<{ challenge: AdminChallenge }>(`/admin/challenges/${id}`, token, { method: 'PATCH', body: input });
}

export function setAdminChallengeActive(token: string, id: string, active: boolean) {
  return callAdmin<{ challenge: AdminChallenge }>(`/admin/challenges/${id}`, token, { method: 'PATCH', body: { active } });
}

export function deleteAdminChallenge(token: string, id: string) {
  return callAdmin<{ ok: true }>(`/admin/challenges/${id}`, token, { method: 'DELETE' });
}

export function fetchAdminBoosts(token: string) {
  return callAdmin<{ boosts: AdminBoost[] }>('/admin/boosts', token);
}

export function createAdminBoost(token: string, input: { challengeId: string; boostedTokens: number; durationHours: number }) {
  return callAdmin<{ boost: AdminBoost }>('/admin/boosts', token, { method: 'POST', body: input });
}

export function cancelAdminBoost(token: string, id: string) {
  return callAdmin<{ ok: true }>(`/admin/boosts/${id}`, token, { method: 'DELETE' });
}

export function fetchAdminTimedChallenges(token: string) {
  return callAdmin<{ challenges: AdminTimedChallenge[] }>('/admin/timed-challenges', token);
}

export function createAdminTimedChallenge(token: string, input: AdminTimedChallengeInput) {
  return callAdmin<{ challenge: AdminTimedChallenge }>('/admin/timed-challenges', token, { method: 'POST', body: input });
}

export function updateAdminTimedChallenge(token: string, id: string, input: AdminTimedChallengeInput) {
  return callAdmin<{ challenge: AdminTimedChallenge }>(`/admin/timed-challenges/${id}`, token, { method: 'PATCH', body: input });
}

export function setAdminTimedChallengeActive(token: string, id: string, active: boolean) {
  return callAdmin<{ challenge: AdminTimedChallenge }>(`/admin/timed-challenges/${id}`, token, { method: 'PATCH', body: { active } });
}

export function deleteAdminTimedChallenge(token: string, id: string) {
  return callAdmin<{ ok: true }>(`/admin/timed-challenges/${id}`, token, { method: 'DELETE' });
}
