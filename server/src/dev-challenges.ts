// Gumpa — developer-authored custom challenges. Lets the developer add new
// tasks to the live app (title, description, token payout, proof method)
// without an app-store release. Rows are soft-deleted (active=0), never
// hard-deleted, so an id already handed to a client — or referenced by a
// past completions/posts row — stays resolvable forever (see catalog.ts),
// same rule already used for local_challenges.

import { requireAuth, requireDeveloper } from './auth';
import type { Cadence, ProofType, VerifyType } from './tokens';
import type { Env } from './env';
import { error, json, safeJson } from './http';
import { parseOptionalLocation, type LocationFields } from './location-fields';

const VALID_CADENCES: Cadence[] = ['daily', 'weekly', 'monthly'];
const VALID_CATS = ['fitness', 'finance', 'social', 'courage', 'explore', 'mind'];
const VALID_VERIFY: VerifyType[] = ['photo', 'streak'];
const VALID_PROOF: ProofType[] = ['camera', 'screenshot', 'either'];
const MAX_TOKENS = 2000;
const MAX_TITLE_LENGTH = 100;
const MAX_DESC_LENGTH = 240;
// Short guidance phrases spliced into /verify's prompt template (see
// verify.ts), not a standalone prompt — kept well short of the model's
// context so a developer can't accidentally (or deliberately) turn this
// into a second free-text override of the whole prompt.
const MAX_PROOF_HINT_LENGTH = 200;
const MAX_VERIFIABILITY_NOTES_LENGTH = 500;
const GUIDE_CHECKLIST_KEYS = ['routineBreaking', 'named', 'photoProvable', 'cadenceAppropriate', 'noRedFlagVerbs'] as const;
type GuideChecklistKey = (typeof GUIDE_CHECKLIST_KEYS)[number];
export type GuideChecklist = Record<GuideChecklistKey, boolean>;

// docs/challenge-writing-guide.md test 5 — these words are a signal to check
// test 2 (named vs. categorized), not an automatic fail: "try an Ethiopian
// restaurant" passes, "try new food" doesn't, same verb. Can't be told apart
// mechanically, so this only ever produces a warning for a human to weigh,
// never a save-blocking error.
const RED_FLAG_VERBS = ['try', 'explore', 'be more', 'work on', 'think about', 'appreciate', 'embrace'];

export interface DevChallengeRow {
  id: string;
  title: string;
  desc: string;
  tokens: number;
  cadence: string;
  cat: string;
  verify_type: string;
  proof_type: string;
  streak_target: number | null;
  place_lat: number | null;
  place_lng: number | null;
  radius_meters: number | null;
  proof_accept: string | null;
  proof_reject: string | null;
  verifiability_notes: string | null;
  guide_checklist: string | null; // JSON-encoded GuideChecklist
  active: number;
  created_by: string;
  created_at: number;
  updated_at: number;
}

export async function getDevChallengeById(env: Env, id: string): Promise<DevChallengeRow | null> {
  return env.DB.prepare('SELECT * FROM dev_challenges WHERE id = ? AND active = 1').bind(id).first<DevChallengeRow>();
}

// Deliberately omits proof_accept/proof_reject/verifiability_notes/
// guide_checklist — those are verification-prompt and audit-trail data for
// the admin dashboard only. Leaking "what a submission needs to avoid" to
// end users would make a challenge easier to fake, and verifiability_notes
// is internal authoring reasoning, not user-facing copy.
function toClientChallenge(row: DevChallengeRow) {
  return {
    id: row.id,
    cadence: row.cadence,
    cat: row.cat,
    tokens: row.tokens,
    title: row.title,
    desc: row.desc,
    verify: row.verify_type,
    proofType: row.proof_type,
    ...(row.streak_target != null ? { streakTarget: row.streak_target } : {}),
  };
}

function parseGuideChecklist(raw: string | null): GuideChecklist | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const result = {} as GuideChecklist;
    for (const key of GUIDE_CHECKLIST_KEYS) result[key] = !!parsed[key];
    return result;
  } catch {
    return null;
  }
}

function isGuideChecklistComplete(raw: string | null): boolean {
  const parsed = parseGuideChecklist(raw);
  return !!parsed && GUIDE_CHECKLIST_KEYS.every((key) => parsed[key] === true);
}

function toAdminShape(row: DevChallengeRow) {
  return {
    id: row.id,
    title: row.title,
    desc: row.desc,
    tokens: row.tokens,
    cadence: row.cadence,
    cat: row.cat,
    verify: row.verify_type,
    proofType: row.proof_type,
    streakTarget: row.streak_target,
    placeLat: row.place_lat,
    placeLng: row.place_lng,
    radiusMeters: row.radius_meters,
    proofAccept: row.proof_accept,
    proofReject: row.proof_reject,
    verifiabilityNotes: row.verifiability_notes,
    guideChecklist: parseGuideChecklist(row.guide_checklist),
    active: !!row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Validates and normalizes a create/update body. Returns either the
// normalized fields or a Response describing what's wrong — every field
// here is authoritative once stored (mirrors resolveCatalogEntry's role for
// the static/local catalogs), so nothing malformed gets past this gate.
function parseChallengeBody(body: Record<string, unknown>): {
  title: string;
  desc: string;
  tokens: number;
  cadence: Cadence;
  cat: string;
  verify: VerifyType;
  proofType: ProofType;
  streakTarget: number | null;
  location: LocationFields | null;
  proofAccept: string | null;
  proofReject: string | null;
  verifiabilityNotes: string | null;
  guideChecklist: string | null;
  // Non-blocking — surfaced by the dashboard (Phase 5) for a human to weigh,
  // never used to reject a save. See RED_FLAG_VERBS above.
  warnings: string[];
} | Response {
  const title = String(body.title ?? '').trim().slice(0, MAX_TITLE_LENGTH);
  const desc = String(body.desc ?? '').trim().slice(0, MAX_DESC_LENGTH);
  const tokens = Number(body.tokens);
  const cadence = String(body.cadence ?? '') as Cadence;
  const cat = String(body.cat ?? '');
  const verify = String(body.verify ?? '') as VerifyType;
  const proofType = String(body.proofType ?? '') as ProofType;
  const streakTargetRaw = body.streakTarget;

  if (!title) return error('Title is required');
  if (!desc) return error('Description is required');
  if (!Number.isInteger(tokens) || tokens <= 0 || tokens > MAX_TOKENS) {
    return error(`Tokens must be a whole number between 1 and ${MAX_TOKENS}`);
  }
  if (!VALID_CADENCES.includes(cadence)) return error(`Cadence must be one of: ${VALID_CADENCES.join(', ')}`);
  if (!VALID_CATS.includes(cat)) return error(`Category must be one of: ${VALID_CATS.join(', ')}`);
  if (!VALID_VERIFY.includes(verify)) return error(`Verify must be one of: ${VALID_VERIFY.join(', ')}`);
  if (!VALID_PROOF.includes(proofType)) return error(`Proof type must be one of: ${VALID_PROOF.join(', ')}`);

  let streakTarget: number | null = null;
  if (verify === 'streak') {
    streakTarget = Number(streakTargetRaw);
    if (!Number.isInteger(streakTarget) || streakTarget <= 0) return error('Streak target is required and must be a positive whole number');
  }

  // Mirrors the exact runtime check that used to live at the bottom of
  // src/lib/data.ts (CHALLENGES.forEach) — catches a challenge whose title+
  // desc never actually names what to photograph, or whose proofType
  // disagrees with what the text says. Blocking, not a warning: this class
  // of bug shipped 20+ times before that check existed.
  const proofText = `${title} ${desc}`.toLowerCase();
  if (!proofText.includes('photo') && !proofText.includes('screenshot')) {
    return error('Title/description must name a photo or screenshot target (mention "photo" or "screenshot")');
  }
  if ((proofType === 'screenshot' || proofType === 'either') && !proofText.includes('screenshot')) {
    return error(`Proof type '${proofType}' requires the title or description to say "screenshot"`);
  }
  if (proofType === 'camera' && !proofText.includes('photo')) {
    return error(`Proof type 'camera' requires the title or description to say "photo"`);
  }

  const warnings: string[] = [];
  const matchedVerbs = RED_FLAG_VERBS.filter((verb) => new RegExp(`\\b${verb}\\b`).test(proofText));
  if (matchedVerbs.length) {
    warnings.push(
      `Contains red-flag word(s) (${matchedVerbs.join(', ')}) that may signal a category instead of a named specific — see docs/challenge-writing-guide.md test 2.`
    );
  }

  const location = parseOptionalLocation(body);
  if (location instanceof Response) return location;

  // All four below are optional — a row with none of them set behaves
  // exactly as before (see verify.ts Phase 2). Short guidance phrases only,
  // never a free-text prompt override — see MAX_PROOF_HINT_LENGTH's comment.
  const proofAcceptRaw = body.proofAccept;
  const proofAccept = proofAcceptRaw == null ? null : String(proofAcceptRaw).trim().slice(0, MAX_PROOF_HINT_LENGTH) || null;
  const proofRejectRaw = body.proofReject;
  const proofReject = proofRejectRaw == null ? null : String(proofRejectRaw).trim().slice(0, MAX_PROOF_HINT_LENGTH) || null;
  const verifiabilityNotesRaw = body.verifiabilityNotes;
  const verifiabilityNotes =
    verifiabilityNotesRaw == null ? null : String(verifiabilityNotesRaw).trim().slice(0, MAX_VERIFIABILITY_NOTES_LENGTH) || null;

  let guideChecklist: string | null = null;
  if (body.guideChecklist != null) {
    if (typeof body.guideChecklist !== 'object') return error('guideChecklist must be an object of booleans');
    const raw = body.guideChecklist as Record<string, unknown>;
    const normalized = {} as GuideChecklist;
    for (const key of GUIDE_CHECKLIST_KEYS) normalized[key] = !!raw[key];
    guideChecklist = JSON.stringify(normalized);
  }

  return { title, desc, tokens, cadence, cat, verify, proofType, streakTarget, location, proofAccept, proofReject, verifiabilityNotes, guideChecklist, warnings };
}

// GET /challenges/custom — every logged-in user needs this to see custom
// challenges in their suggestion pool, same trust level as /local-challenges.
export async function handleListCustomChallenges(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (!auth) return error('Not authenticated', 401);

  const { results } = await env.DB.prepare('SELECT * FROM dev_challenges WHERE active = 1').all<DevChallengeRow>();
  return json({ challenges: (results ?? []).map(toClientChallenge) });
}

export async function handleAdminListChallenges(request: Request, env: Env): Promise<Response> {
  const auth = await requireDeveloper(request, env);
  if (!auth) return error('Not found', 404);

  const { results } = await env.DB.prepare('SELECT * FROM dev_challenges ORDER BY created_at DESC').all<DevChallengeRow>();
  return json({ challenges: (results ?? []).map(toAdminShape) });
}

export async function handleAdminCreateChallenge(request: Request, env: Env): Promise<Response> {
  const auth = await requireDeveloper(request, env);
  if (!auth) return error('Not found', 404);

  const body = await safeJson(request);
  if (!body) return error('Invalid JSON body');

  const parsed = parseChallengeBody(body);
  if (parsed instanceof Response) return parsed;

  // Mechanical proxy for "the five-test guide was actually applied" (decision
  // 4 — the underlying judgment stays human, but publishing requires the
  // checklist to say so). Defaults to true to match the pre-Phase-4 behavior
  // of every create being immediately active when no guideChecklist is sent.
  const requestedActive = body.active !== false;
  if (requestedActive && !isGuideChecklistComplete(parsed.guideChecklist)) {
    return error(
      'All five guide_checklist items must be true before a task can be published (active). Send active: false to save it as a draft instead.'
    );
  }

  const id = crypto.randomUUID();
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO dev_challenges (id, title, desc, tokens, cadence, cat, verify_type, proof_type, streak_target, place_lat, place_lng, radius_meters, proof_accept, proof_reject, verifiability_notes, guide_checklist, active, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      parsed.title,
      parsed.desc,
      parsed.tokens,
      parsed.cadence,
      parsed.cat,
      parsed.verify,
      parsed.proofType,
      parsed.streakTarget,
      parsed.location?.placeLat ?? null,
      parsed.location?.placeLng ?? null,
      parsed.location?.radiusMeters ?? null,
      parsed.proofAccept,
      parsed.proofReject,
      parsed.verifiabilityNotes,
      parsed.guideChecklist,
      requestedActive ? 1 : 0,
      auth.id,
      now,
      now
    )
    .run();

  const row = await env.DB.prepare('SELECT * FROM dev_challenges WHERE id = ?').bind(id).first<DevChallengeRow>();
  return json({ challenge: row ? toAdminShape(row) : null, warnings: parsed.warnings });
}

export async function handleAdminUpdateChallenge(request: Request, env: Env, id: string): Promise<Response> {
  const auth = await requireDeveloper(request, env);
  if (!auth) return error('Not found', 404);

  const existing = await env.DB.prepare('SELECT * FROM dev_challenges WHERE id = ?').bind(id).first<DevChallengeRow>();
  if (!existing) return error('Not found', 404);

  const body = await safeJson(request);
  if (!body) return error('Invalid JSON body');

  // A bare {"active": false} toggle doesn't need every other field re-sent.
  let warnings: string[] = [];
  if (Object.keys(body).length === 1 && typeof body.active === 'boolean') {
    if (body.active && !isGuideChecklistComplete(existing.guide_checklist)) {
      return error('All five guide_checklist items must be true before this task can be published (active).');
    }
    await env.DB.prepare('UPDATE dev_challenges SET active = ?, updated_at = ? WHERE id = ?')
      .bind(body.active ? 1 : 0, Date.now(), id)
      .run();
  } else {
    const parsed = parseChallengeBody(body);
    if (parsed instanceof Response) return parsed;
    warnings = parsed.warnings;
    await env.DB.prepare(
      `UPDATE dev_challenges SET title = ?, desc = ?, tokens = ?, cadence = ?, cat = ?, verify_type = ?, proof_type = ?, streak_target = ?, place_lat = ?, place_lng = ?, radius_meters = ?, proof_accept = ?, proof_reject = ?, verifiability_notes = ?, guide_checklist = ?, updated_at = ? WHERE id = ?`
    )
      .bind(
        parsed.title,
        parsed.desc,
        parsed.tokens,
        parsed.cadence,
        parsed.cat,
        parsed.verify,
        parsed.proofType,
        parsed.streakTarget,
        parsed.location?.placeLat ?? null,
        parsed.location?.placeLng ?? null,
        parsed.location?.radiusMeters ?? null,
        parsed.proofAccept,
        parsed.proofReject,
        parsed.verifiabilityNotes,
        parsed.guideChecklist,
        Date.now(),
        id
      )
      .run();
  }

  const row = await env.DB.prepare('SELECT * FROM dev_challenges WHERE id = ?').bind(id).first<DevChallengeRow>();
  return json({ challenge: row ? toAdminShape(row) : null, warnings });
}

// Soft delete only — see file header. Deactivates rather than removes.
export async function handleAdminDeleteChallenge(request: Request, env: Env, id: string): Promise<Response> {
  const auth = await requireDeveloper(request, env);
  if (!auth) return error('Not found', 404);

  const result = await env.DB.prepare('UPDATE dev_challenges SET active = 0, updated_at = ? WHERE id = ?').bind(Date.now(), id).run();
  if (result.meta.changes === 0) return error('Not found', 404);
  return json({ ok: true });
}
