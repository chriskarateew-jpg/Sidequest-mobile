// Gumpa — game state store (zustand + AsyncStorage).
// Ported from the web app's js/state.js. Reads happen against an
// in-memory copy (hydrated once at launch); writes persist async
// in the background, mirroring localStorage's sync-read feel.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { useAuthStore } from '@/lib/auth';
import { CHALLENGES, type Challenge, type Cadence } from '@/lib/data';
import { getCurrentRoundedLocation } from '@/lib/location';
import { fetchLocalChallenges } from '@/lib/local-challenges';

const STORAGE_KEY = 'gumpa_state_v1';
const LOCAL_CHALLENGES_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface Completion {
  at: number;
  status: 'complete' | 'in_progress';
  photoUri?: string; // set on the submission that completed it (photo, or a streak's final check-in)
  progress?: number; // streak only
  target?: number; // streak only
  lastCheckinDay?: string; // streak only — local mirror of the server's day guard
}

interface PersistedState {
  tokens: number;
  xp: number;
  completions: Record<string, Completion>;
  streak: { count: number; lastDay: string | null };
  weekly: { key: string | null; earned: number };
  // Location-flavored challenges fetched from the server (see
  // src/lib/local-challenges.ts) — weekly or monthly cadence depending on
  // how big a visit the place warrants, merged into the suggestion pool
  // alongside the static CHALLENGES catalog and guaranteed a slot there (see
  // pickSuggestions below). Entirely optional: locationOptOut tracks a
  // denied permission or an explicit opt-out from Profile, and the app
  // works exactly as before without it.
  localChallenges: Challenge[];
  localChallengesFetchedAt: number | null;
  locationOptOut: boolean;
}

const DEFAULT_STATE: PersistedState = {
  tokens: 120,
  xp: 0,
  completions: {},
  streak: { count: 0, lastDay: null },
  weekly: { key: null, earned: 0 },
  localChallenges: [],
  localChallengesFetchedAt: null,
  locationOptOut: false,
};

// ---------- period keys ----------
function pad(n: number) {
  return String(n).padStart(2, '0');
}

function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function weekKey(d = new Date()) {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day + 3);
  const jan4 = new Date(date.getFullYear(), 0, 4);
  const week = 1 + Math.round(((date.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getDay() + 6) % 7)) / 7);
  return `${date.getFullYear()}-W${pad(week)}`;
}

function monthKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function periodKeyFor(cadence: Cadence) {
  if (cadence === 'daily') return dayKey();
  if (cadence === 'weekly') return weekKey();
  return monthKey();
}

// ---------- seeded rng (deterministic per period, so suggestions rotate) ----------
function hashStr(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(arr: T[], seedStr: string): T[] {
  const rng = mulberry32(hashStr(seedStr));
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// `extra` (local challenges) is folded into the pool before filtering, so
// the one-per-category-first logic below lets them compete against the
// static 'explore' entries same as before — but that competition alone left
// local challenges showing up as roughly a coin flip, since 'explore' is
// only one of six categories fighting for `count` slots. On top of that,
// local challenges always get a guaranteed slot when any exist for this
// cadence and the regular rotation didn't already surface one — exploring
// real nearby places should be a reliable presence, not a maybe. That slot
// is carved out of `count` (replacing the last regular pick), never added
// on top of it — `count` is a hard cap on how many cards a section shows,
// so with count=1 (monthly) this swaps in the local pick instead of
// producing a second card.
function pickSuggestions(cadence: Cadence, count: number, extra: Challenge[]): Challenge[] {
  const pool = [...CHALLENGES, ...extra].filter((c) => c.cadence === cadence);
  const shuffled = seededShuffle(pool, cadence + ':' + periodKeyFor(cadence));
  const picked: Challenge[] = [];
  const usedCats = new Set<string>();
  for (const c of shuffled) {
    if (picked.length >= count) break;
    if (!usedCats.has(c.cat)) {
      picked.push(c);
      usedCats.add(c.cat);
    }
  }
  for (const c of shuffled) {
    if (picked.length >= count) break;
    if (!picked.includes(c)) picked.push(c);
  }

  const localForCadence = extra.filter((c) => c.cadence === cadence);
  if (localForCadence.length > 0 && !picked.some((c) => c.isLocal)) {
    const guaranteed = seededShuffle(localForCadence, cadence + ':guaranteed:' + periodKeyFor(cadence))[0];
    if (picked.length < count) picked.push(guaranteed);
    else picked[picked.length - 1] = guaranteed;
  }

  return picked;
}

// ---------- level ----------
export function levelInfo(xp: number) {
  const level = Math.floor(Math.sqrt(xp / 60)) + 1;
  const floor = 60 * (level - 1) * (level - 1);
  const ceil = 60 * level * level;
  return { level, progress: (xp - floor) / (ceil - floor), toNext: ceil - xp };
}

export interface ServerCompletion {
  status: 'complete' | 'in_progress';
  progress: number;
  target: number;
}

export type RefreshLocalChallengesResult =
  | { status: 'skipped' } // within TTL, force not set — nothing attempted
  | { status: 'denied' }
  | { status: 'location-error' } // e.g. getCurrentPositionAsync timed out or GPS unavailable
  | { status: 'no-session' }
  | { status: 'fetch-error' } // reached the server call, but it failed or the network dropped
  | { status: 'fetched'; count: number };

// Surfaces what refreshLocalChallenges actually did — every non-happy-path
// outcome used to fail completely silently, which made "why do I see
// nothing near me" impossible to debug from the app alone. Returns null for
// outcomes with nothing worth telling the user (a plain TTL-guarded no-op).
export function describeLocalChallengesResult(result: RefreshLocalChallengesResult): string | null {
  switch (result.status) {
    case 'skipped':
      return null;
    case 'denied':
      return 'Location access is off. Enable it for this app in your device settings.';
    case 'location-error':
      return "Couldn't get your location. Check your GPS/network and try again.";
    case 'no-session':
      return 'Log in again to fetch local tasks.';
    case 'fetch-error':
      return "Couldn't reach the server. Check your connection and try again.";
    case 'fetched':
      return result.count > 0
        ? `Found ${result.count} local task${result.count === 1 ? '' : 's'} near you.`
        : 'No local tasks found near you yet. Try again later.';
  }
}

// ---------- store ----------
interface GumpaStore extends PersistedState {
  hydrated: boolean;
  hydrate: () => Promise<void>;

  getSuggestions: () => { daily: Challenge[]; weekly: Challenge[]; monthly: Challenge[] };

  isCompleted: (c: Challenge) => boolean;
  completePhoto: (id: string, photoUri: string) => Challenge | null;
  logStreakPhoto: (id: string, photoUri: string) => { challenge: Challenge; progress: number; target: number; justCompleted: boolean } | null;
  currentStreak: () => number;

  // Tokens are server-authoritative now (see server/src/tokens.ts) — this
  // just reconciles the local mirror after an earn/spend round-trip, or
  // after fetching the balance fresh on login.
  syncTokens: (tokens: number) => void;
  // Reconciles local completion progress/status against the /complete
  // response, same optimistic-then-reconcile pattern as syncTokens.
  syncCompletion: (id: string, periodKey: string, server: ServerCompletion) => void;

  // Fetches location-flavored challenges for the device's current (rounded)
  // location. No-ops if already fetched within the TTL unless forced. Sets
  // locationOptOut on a denied permission; a transient fetch error leaves
  // the opt-out state untouched so it's retried next time instead of
  // permanently giving up. Returns a result so callers (Profile, the
  // onboarding modal) can surface what actually happened instead of failing
  // silently — this used to swallow every non-happy-path outcome with no
  // user-visible signal at all.
  refreshLocalChallenges: (force?: boolean) => Promise<RefreshLocalChallengesResult>;
  // Purely client-side — the server stores no per-user location data at
  // all, so there's nothing server-side to clear.
  clearLocalArea: () => void;
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePersist(get: () => GumpaStore) {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    const s = get();
    const toSave: PersistedState = {
      tokens: s.tokens,
      xp: s.xp,
      completions: s.completions,
      streak: s.streak,
      weekly: s.weekly,
      localChallenges: s.localChallenges,
      localChallengesFetchedAt: s.localChallengesFetchedAt,
      locationOptOut: s.locationOptOut,
    };
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(toSave)).catch(() => {
      // best-effort persistence — in-memory state is still correct this session
    });
  }, 250);
}

// Shared reward side-effects (tokens/xp/weekly-earned/daily-streak-counter)
// for any completion that just became 'complete', regardless of verify method.
function applyReward(s: GumpaStore, c: Challenge) {
  const tokens = s.tokens + c.tokens;
  const xp = s.xp + c.tokens;

  const wk = weekKey();
  const weekly = s.weekly.key === wk ? { key: wk, earned: s.weekly.earned + c.tokens } : { key: wk, earned: c.tokens };

  const today = dayKey();
  let streak = s.streak;
  if (s.streak.lastDay !== today) {
    const yesterday = dayKey(new Date(Date.now() - 86400000));
    streak = { count: s.streak.lastDay === yesterday ? s.streak.count + 1 : 1, lastDay: today };
  }

  return { tokens, xp, weekly, streak };
}

export const useGumpaStore = create<GumpaStore>((set, get) => ({
  ...structuredClone(DEFAULT_STATE),
  hydrated: false,

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) set({ ...JSON.parse(raw), hydrated: true });
      else set({ hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },

  getSuggestions: () => {
    const local = get().localChallenges;
    return {
      daily: pickSuggestions('daily', 2, local),
      weekly: pickSuggestions('weekly', 3, local),
      monthly: pickSuggestions('monthly', 1, local),
    };
  },

  isCompleted: (c) => get().completions[`${c.id}:${periodKeyFor(c.cadence)}`]?.status === 'complete',

  completePhoto: (id, photoUri) => {
    const c = findChallengeById(id);
    const s = get();
    if (!c || !photoUri || s.isCompleted(c)) return null;

    const key = `${c.id}:${periodKeyFor(c.cadence)}`;
    const completions = { ...s.completions, [key]: { at: Date.now(), status: 'complete' as const, photoUri } };
    set({ completions, ...applyReward(s, c) });
    schedulePersist(get);
    return c;
  },

  logStreakPhoto: (id, photoUri) => {
    const c = findChallengeById(id);
    const s = get();
    if (!c || !c.streakTarget || !photoUri || s.isCompleted(c)) return null;

    const key = `${c.id}:${periodKeyFor(c.cadence)}`;
    const today = dayKey();
    const existing = s.completions[key];
    if (existing?.lastCheckinDay === today) return null; // already checked in today

    const progress = (existing?.progress ?? 0) + 1;
    const justCompleted = progress >= c.streakTarget;
    const completion: Completion = {
      at: Date.now(),
      status: justCompleted ? 'complete' : 'in_progress',
      photoUri,
      progress,
      target: c.streakTarget,
      lastCheckinDay: today,
    };
    const completions = { ...s.completions, [key]: completion };

    if (justCompleted) {
      set({ completions, ...applyReward(s, c) });
    } else {
      set({ completions });
    }
    schedulePersist(get);
    return { challenge: c, progress, target: c.streakTarget, justCompleted };
  },

  currentStreak: () => {
    const s = get();
    const today = dayKey();
    const yesterday = dayKey(new Date(Date.now() - 86400000));
    if (s.streak.lastDay === today || s.streak.lastDay === yesterday) return s.streak.count;
    return 0;
  },

  syncTokens: (tokens) => {
    set({ tokens });
    schedulePersist(get);
  },

  syncCompletion: (id, periodKey, server) => {
    const s = get();
    const key = `${id}:${periodKey}`;
    const prev = s.completions[key];
    const completions: Record<string, Completion> = {
      ...s.completions,
      [key]: {
        at: prev?.at ?? Date.now(),
        status: server.status,
        photoUri: prev?.photoUri,
        progress: server.progress,
        target: server.target,
        lastCheckinDay: prev?.lastCheckinDay,
      },
    };
    set({ completions });
    schedulePersist(get);
  },

  refreshLocalChallenges: async (force = false) => {
    const s = get();
    if (!force && s.localChallengesFetchedAt !== null && Date.now() - s.localChallengesFetchedAt < LOCAL_CHALLENGES_TTL_MS) {
      return { status: 'skipped' };
    }

    const location = await getCurrentRoundedLocation();
    if (location.status === 'denied') {
      set({ locationOptOut: true });
      schedulePersist(get);
      return { status: 'denied' };
    }
    if (location.status === 'error') return { status: 'location-error' }; // transient — try again next time, don't opt out

    const token = useAuthStore.getState().token;
    if (!token) return { status: 'no-session' };

    try {
      const challenges = await fetchLocalChallenges({ token, lat: location.lat, lng: location.lng });
      set({ localChallenges: challenges, localChallengesFetchedAt: Date.now(), locationOptOut: false });
      schedulePersist(get);
      return { status: 'fetched', count: challenges.length };
    } catch {
      return { status: 'fetch-error' };
    }
  },

  clearLocalArea: () => {
    set({ localChallenges: [], localChallengesFetchedAt: null, locationOptOut: true });
    schedulePersist(get);
  },
}));

// Checks the static catalog first, then any fetched local challenges —
// used everywhere a challenge needs resolving by id (the completion actions
// above).
export function findChallengeById(id: string): Challenge | undefined {
  return CHALLENGES.find((c) => c.id === id) ?? useGumpaStore.getState().localChallenges.find((c) => c.id === id);
}
