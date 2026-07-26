// Sidequest — server-side period keys, mirroring src/lib/store.ts's
// dayKey/weekKey/monthKey. Computed independently from Date.now() (UTC, since
// the Worker has no notion of the user's local timezone) rather than trusting
// a client-supplied period key — a forged period key would otherwise let a
// client "complete" the same challenge repeatedly.
//
// Known limitation: the client computes its period key from local time, so a
// user near a day/week boundary can briefly see their local "today" disagree
// with the server's UTC "today". Acceptable at solo/personal scale.

import type { Cadence } from './tokens';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function dayKey(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function weekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day + 3);
  const jan4 = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((date.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return `${date.getUTCFullYear()}-W${pad(week)}`;
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

export function computePeriodKey(cadence: Cadence, now = new Date()): string {
  if (cadence === 'daily') return dayKey(now);
  if (cadence === 'weekly') return weekKey(now);
  return monthKey(now);
}

export function todayKey(now = new Date()): string {
  return dayKey(now);
}
