// Mirrors server/src/dev-challenges.ts's toAdminShape output and
// server/src/tokens.ts's Cadence/VerifyType/ProofType. Kept as a hand
// synced copy (same approach src/lib/admin-api.ts already uses on the Expo
// side) rather than a shared package, since this is a separate deploy
// target — see docs/task-database-roadmap.md decision 3.

export type Cadence = 'daily' | 'weekly' | 'monthly';
export type VerifyType = 'photo' | 'streak';
export type ProofType = 'camera' | 'screenshot' | 'either';

export const CADENCES: Cadence[] = ['daily', 'weekly', 'monthly'];
export const VERIFY_TYPES: VerifyType[] = ['photo', 'streak'];
export const PROOF_TYPES: ProofType[] = ['camera', 'screenshot', 'either'];

// Matches server/src/dev-challenges.ts's GUIDE_CHECKLIST_KEYS exactly —
// order here is the order shown in the form.
export const GUIDE_CHECKLIST_ITEMS = [
  { key: 'routineBreaking', label: 'Routine-breaking — a new place, object, activity, or rerouted habit' },
  { key: 'named', label: 'Named the specific thing (not a category, not a menu of options)' },
  { key: 'photoProvable', label: 'Photo-provable in one shot — could someone fake it without doing the task?' },
  { key: 'cadenceAppropriate', label: 'Scope matches its cadence (zero-planning / short trip / real multi-step goal)' },
  { key: 'noRedFlagVerbs', label: 'No red-flag verb standing in for a missing specific' },
] as const;
export type GuideChecklistKey = (typeof GUIDE_CHECKLIST_ITEMS)[number]['key'];
export type GuideChecklist = Record<GuideChecklistKey, boolean>;

export interface AdminChallenge {
  id: string;
  title: string;
  desc: string;
  tokens: number;
  cadence: Cadence;
  verify: VerifyType;
  proofType: ProofType;
  streakTarget: number | null;
  placeLat: number | null;
  placeLng: number | null;
  radiusMeters: number | null;
  proofAccept: string | null;
  proofReject: string | null;
  verifiabilityNotes: string | null;
  guideChecklist: GuideChecklist | null;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface AdminChallengeInput {
  title: string;
  desc: string;
  tokens: number;
  cadence: Cadence;
  verify: VerifyType;
  proofType: ProofType;
  streakTarget?: number;
  placeLat?: number;
  placeLng?: number;
  radiusMeters?: number;
  proofAccept?: string;
  proofReject?: string;
  verifiabilityNotes?: string;
  guideChecklist?: GuideChecklist;
  // Create only — server defaults true when omitted, matching pre-Phase-4
  // behavior. Update never sends this; active is toggled separately via the
  // bare {active} PATCH, same as the Expo dev panel does.
  active?: boolean;
}
