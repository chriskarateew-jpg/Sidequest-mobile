// Gumpa — challenge & shop catalog.
// Ported from the web app's js/data.js (kept in sync intentionally).

export type Cadence = 'daily' | 'weekly' | 'monthly';

// How a challenge's completion gets proven — every challenge is photo-verified
// by Claude via POST /verify, no honor-tap exists:
//  - 'photo': one photo, one completion.
//  - 'streak': N separate photo check-ins across the period (one per
//    calendar day), e.g. "3 workouts this week."
export type VerifyMethod = 'photo' | 'streak';

// What kind of image proves this challenge, and therefore which capture path
// the client offers:
//  - 'camera': a real-world moment — must come from the live in-app camera
//    (src/lib/photo.ts's capturePhoto), never the gallery, so an old or
//    internet-sourced photo can't be submitted.
//  - 'screenshot': proof of another app's UI (a step count, a screen-time
//    total, a transfer confirmation) — camera-only capture is impossible
//    here (you can't photograph your own screen with your own camera), so
//    these instead pick from the OS's own Screenshots album specifically
//    (src/lib/photo.ts's pickScreenshot), not the general camera roll.
//  - 'either': accepts both (e.g. a skill-practice streak that could be a
//    photo of the activity or a screenshot of a tracking app).
// Server-authoritative — mirrored in server/src/tokens.ts and never trusted
// from the client, same as tokens/verify/title/desc.
export type ProofType = 'camera' | 'screenshot' | 'either';

export interface Challenge {
  id: string;
  cadence: Cadence;
  tokens: number;
  title: string;
  desc: string;
  verify: VerifyMethod;
  proofType: ProofType;
  streakTarget?: number; // instances required within the period; only set when verify === 'streak'
  bgImage?: string; // city skyline/downtown photo — only set on server-generated local challenges
  isLocal?: boolean; // server-generated, tied to a real nearby place (see server/src/local-challenges.ts) — guaranteed a suggestion slot, see pickSuggestions in store.ts
  // Only set on local challenges (see server/src/local-challenges.ts's
  // toClientChallenge) — lat/lng feed the detail view's "Get Directions"
  // link (src/components/location-detail-modal.tsx), never anything
  // verification-related, that stays entirely server-side.
  placeName?: string;
  lat?: number;
  lng?: number;
  longDesc?: string;
}

// Formerly the 40-entry static catalog. Migrated into dev_challenges (see
// server/migrations/0020_migrate_static_challenges.sql and
// docs/task-database-roadmap.md Phase 3) so tasks are editable without an
// app-store release. The client now relies entirely on the
// fetch-and-cache-to-disk pattern already built for developer-authored
// tasks: store.ts's customChallenges is fetched from GET /challenges/custom
// and persisted to AsyncStorage as part of the whole store (see
// schedulePersist/hydrate there), so a cold start with no network still
// shows the last-fetched list rather than nothing — the same tradeoff
// already accepted for local/dev-authored tasks, now extended to every
// task. An empty array here is correct, not a placeholder pending more
// work; see the same reasoning in server/src/tokens.ts's CHALLENGE_CATALOG.
export const CHALLENGES: Challenge[] = [];

// Catches the exact class of bug that shipped repeatedly here: a challenge
// marked verify:'photo'/'streak' whose title+desc never actually says what
// to photograph (see docs/challenge-writing-guide.md's "no zero-cost fake
// path" rule) — 20+ entries had this before an actual audit caught it, and
// nothing had been checking for it automatically. Doesn't (and can't) check
// that the described photo target is a good one, only that one is named.
CHALLENGES.forEach((c) => {
  if (c.verify === 'streak' && !c.streakTarget) throw new Error(`Challenge "${c.id}" is verify:'streak' but has no streakTarget`);
  const text = `${c.title} ${c.desc}`.toLowerCase();
  if (!text.includes('photo') && !text.includes('screenshot')) {
    throw new Error(`Challenge "${c.id}" doesn't name a photo/screenshot target in its title or desc`);
  }
  if ((c.proofType === 'screenshot' || c.proofType === 'either') && !text.includes('screenshot')) {
    throw new Error(`Challenge "${c.id}" is proofType '${c.proofType}' but never says "screenshot" in its title or desc`);
  }
  if (c.proofType === 'camera' && !text.includes('photo')) {
    throw new Error(`Challenge "${c.id}" is proofType 'camera' but never says "photo"/"photograph" in its title or desc`);
  }
});
