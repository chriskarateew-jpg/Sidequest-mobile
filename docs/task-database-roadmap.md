# Task database roadmap

A roadmap prompt for turning task creation into a database-backed workflow:
every task gets a Title, Description, Token Reward, submission method, an
explicit verifiability record, and a structured Claude Haiku verification
prompt — all editable over time without an app-store release, including
adding brand-new tasks and deleting/deactivating existing ones, entirely
from the dashboard. Feed this whole file to a fresh Claude session to
implement it. It is a plan, not yet implemented — nothing described below
exists until a phase's checkboxes are done.

Four design questions were already decided with the user (2026-08-06) and
are **locked in** — don't re-ask them, don't re-litigate them, just build to
them:

1. **Migrate the 35 static tasks into the database too** (actually 40 — see
   Phase 3's correction note) — one source of truth, not two parallel
   systems.
2. **Structured verification hints, not a free-text prompt override** —
   each task gets fields (what counts as proof, what to reject) that get
   merged into a guarded template, not an arbitrary string sent straight to
   Claude.
3. **Build a separate web dashboard** — not an extension of the in-app
   `src/app/dev.tsx` screens.
4. **Automated checks where mechanical, checklist for the rest** — reject
   red-flag words, enforce required fields; leave "is this actually
   routine-breaking / fakeable" to human judgment, recorded as data.

## Current state (verified against the code on 2026-08-06)

This is not a greenfield build — a developer-authored task database already
exists and is live in production. The gap is narrower than "build a
database"; it's "extend the one that's already load-bearing."

- **`dev_challenges` table** (`server/migrations/0016_dev_admin.sql`) — id,
  title, desc, tokens, cadence, cat, verify_type, proof_type, streak_target,
  place_lat/lng, radius_meters, active, created_by, created_at, updated_at.
  Soft-deleted only (`active=0`), never hard-deleted, because a handed-out id
  must stay resolvable forever (past completions/posts reference it).
- **Full CRUD admin API** in `server/src/dev-challenges.ts`
  (`handleAdminListChallenges` / `Create` / `Update` / `Delete`), gated by
  `requireDeveloper` (`server/src/auth.ts:145`).
- **Already wired into resolution**: `server/src/catalog.ts`'s
  `resolveBaseCatalogEntry` checks the static in-memory `CHALLENGE_CATALOG`
  (`server/src/tokens.ts`) first, then `local_challenges`, then
  `dev_challenges`, then `timed_challenges`. `/verify` and `/complete` both
  go through this, so a `dev_challenges` row is already a first-class task,
  indistinguishable to a user from a static one.
- **Already surfaced client-side**: `src/lib/store.ts`'s `pickSuggestions`
  merges `[...CHALLENGES (bundled static), ...local, ...custom (dev)]` into
  one suggestion pool. `customChallenges` is fetched from
  `GET /challenges/custom` on a 3-minute TTL (`CUSTOM_CHALLENGES_TTL_MS`,
  `store.ts:23`).
- **An in-app admin UI already exists**: `src/app/dev.tsx` +
  `src/app/dev-challenge-form.tsx`. Decision 3 above means this stays as a
  secondary/fallback surface, not the primary one going forward.

What's actually missing:

- **No per-task verification prompt data.** `server/src/verify.ts`'s
  `buildPrompt(title, desc)` (line 106) is one generic template shared by
  every challenge source — static, local, dev, timed. There is nowhere to
  say "for this task, a blurry gym mirror selfie is fine" or "for this task,
  reject anything without a visible street sign."
- **No stored verifiability record.** `docs/challenge-writing-guide.md`'s
  five tests (routine-breaking, named not categorized, photo-provable,
  cadence-appropriate, no red-flag verbs) are applied by a human/AI at
  write time and then forgotten — nothing persists the reasoning or a
  pass/fail per task.
- **Two parallel catalogs.** The 35 tasks in `src/lib/data.ts` /
  `server/src/tokens.ts` are hardcoded and require a deploy to change;
  `dev_challenges` rows don't.

## Where the database lives

No new database. Everything lands in the **same Cloudflare D1 instance**
already used for users, posts, `local_challenges`, `dev_challenges`, etc.
(`server/wrangler.toml`). This is additive: new nullable columns on
`dev_challenges`, plus the migration of the 35 static rows into it — not a
new binding, not new infra, and it stays inside the free-tier constraints
already called out in `AGENTS.md`.

The **dashboard** (decision 3) is new surface area, but it doesn't need new
backend infra either: it's a small static web app (recommend Cloudflare
Pages, matching the rest of the stack, free tier, effectively zero
incremental cost for developer-only traffic) that authenticates through the
**existing** login endpoints and calls the **existing** (extended)
`requireDeveloper`-gated admin API. No parallel auth system to build.

## Feasibility assessment

**Functional risk: low.** The resolution path (`resolveBaseCatalogEntry`),
the CRUD API, and the soft-delete/immutable-id discipline are already
proven in production for `dev_challenges` and `local_challenges`. Adding
verification-hint columns and a verifiability record is schema-additive —
existing rows get NULL/defaults, `buildPrompt` falls back to today's exact
generic template when hints are absent, so nothing existing breaks mid-
migration.

**Efficiency: no meaningful cost impact.** Catalog resolution is already a
single indexed primary-key lookup per source per request; adding columns
doesn't change that. No new Anthropic calls are introduced — still one
Haiku call per `/verify` submission, just a richer prompt. The dashboard's
traffic is developer-only (you), negligible against Cloudflare free-tier
request/CPU quotas.

**Verifiability of the migration itself: needs a deliberate check, not an
assumption.** Two things must be true before the static arrays are deleted:

1. **Every migrated id resolves identically.** Write a one-off script that,
   for each of the 35 ids, compares the DB row's resolved fields
   (`resolveBaseCatalogEntry` output) against the current
   `CHALLENGE_CATALOG` entry field-by-field. Any diff blocks the cutover.
2. **The client's offline/cold-start path doesn't quietly regress.**
   `CHALLENGES` in `data.ts` is bundled into the app today — suggestions
   render instantly with zero network round trip, including on first launch
   before any fetch completes. Moving those 35 into the DB means the client
   now depends on `GET /challenges/custom` (or a generalized successor) for
   what used to be always-available. This needs an explicit answer, not a
   silent behavior change — see Phase 3.

## Phase 1 — Schema: verification hints + verifiability record ✅ done (2026-08-06)

- [x] Add columns to `dev_challenges` (new migration
      `0019_task_verification_fields.sql`, applied to the local D1 dev
      database and schema-verified with `PRAGMA table_info`; **not yet
      applied to the remote/production database** — that's a gated
      production action, run it explicitly when ready):
  - `proof_accept TEXT` — nullable, short phrase(s) describing what counts
    as valid proof for this specific task (e.g. "a visible street sign or
    landmark in frame").
  - `proof_reject TEXT` — nullable, what to explicitly reject beyond the
    generic template's defaults (e.g. "reject if no gym equipment visible").
  - `verifiability_notes TEXT` — nullable, free text: the human's reasoning
    for why this task passes the five-test guide, written at authoring time
    (not shown to Claude, not shown to end users — reviewer/audit trail
    only).
  - `guide_checklist TEXT` — nullable JSON blob of the five boolean checks
    from `docs/challenge-writing-guide.md` (`routineBreaking`, `named`,
    `photoProvable`, `cadenceAppropriate`, `noRedFlagVerbs`), each set by
    whoever authored the task.
- [x] Extend `DevChallengeRow`, `parseChallengeBody`, `toAdminShape` in
      `server/src/dev-challenges.ts` for the new fields. Kept optional in
      the create/update body — a row can exist without hints, falling back
      to today's generic prompt. Also added a `GuideChecklist` type and
      `GUIDE_CHECKLIST_KEYS` constant, and deliberately excluded the new
      fields from `toClientChallenge` (verification hints and authoring
      notes stay admin-only, never shipped to end users — see the comment
      added above that function).
- [x] Extend `CatalogEntry` in `server/src/tokens.ts` with optional
      `proofAccept`/`proofReject`, threaded through `resolveBaseCatalogEntry`
      in `catalog.ts`'s `devRow` branch so `/verify` can read them.

## Phase 2 — Verification prompt integration ✅ done (2026-08-06)

- [x] `server/src/verify.ts`'s `buildPrompt` now takes optional
      `proofAccept`/`proofReject` and appends them as two extra guidance
      lines right before the closing JSON-format instruction — the existing
      leniency/screenshot/reject-unrelated language is untouched and comes
      first, so a task with no hints produces the exact same prompt as
      before.
- [x] Hints are treated as data, not as a prompt themselves: they're already
      capped to 200 chars at write time in `dev-challenges.ts`
      (`MAX_PROOF_HINT_LENGTH`), and `buildPrompt` re-slices them again
      defensively (`PROOF_HINT_DEFENSIVE_CAP`) in case a row is ever written
      by something other than that endpoint (e.g. a future Phase 3 migration
      script).
- [x] Regression-tested the no-hints case: extracted `buildPrompt`'s exact
      pre-Phase-2 logic into a standalone script and diffed its output
      against the new function called with `proofAccept`/`proofReject`
      both `undefined` — **byte-identical**, confirmed programmatically, not
      just by inspection. Also confirmed the with-hints case appends
      correctly (both lines present, existing lines unchanged).
      - **Not done**: a live round-trip through the real Anthropic API — the
        `ANTHROPIC_API_KEY` in `server/.dev.vars` is a placeholder, not a
        real key, so there's nothing to call locally. The real key only
        lives on the deployed Worker (`wrangler secret put`, production).
        A true end-to-end check (real photo, real Haiku call, hint-bearing
        task) is Phase 6's job once Phase 5's dashboard exists to actually
        create a task with hints set — don't skip that check when you get
        there, this phase only proved the prompt-construction logic, not
        the model's reaction to it.

## Phase 3 — Migrate the static catalog into the database ✅ shipped to production (2026-08-06)

**Correction**: the static catalog was actually **40** tasks (15 daily / 17
weekly / 8 monthly), not 35 — the earlier estimate was off; every step below
accounts for all 40.

- [x] **Offline-fallback decision**: fetch-and-cache-to-disk, per the user
      (2026-08-06). Turned out to need **no new client code** — `store.ts`
      already persists `customChallenges` to AsyncStorage as part of the
      whole store (`schedulePersist`/`hydrate`) and fetches it on launch via
      `refreshCustomChallenges` (wired up in `_layout.tsx`) whenever a
      session token exists. That mechanism, built for developer-authored
      extras, is now what *every* task relies on for cold-start/offline
      behavior — no separate seed set needed.
- [x] **Drift check before picking a source of truth**: diffed `data.ts`
      against `tokens.ts` field-by-field (script, not eyeballing). Zero
      differences in tokens/cadence/cat/verify/proofType/streakTarget across
      all 40 — but 29 of 40 `desc` fields had drifted: `tokens.ts` had
      picked up em dashes (`—`) that `data.ts` never had, i.e. `tokens.ts`
      was quietly violating `AGENTS.md`'s "no em dashes in challenge
      titles/descriptions" rule. Used `data.ts`'s text as the migration
      source (compliant, and what users already see) — this migration
      incidentally fixes that drift instead of baking it into the new row.
- [x] One-off migration script generated
      `server/migrations/0020_migrate_static_challenges.sql` — 40 `INSERT`s
      into `dev_challenges` using the **exact same ids** (`d-water`,
      `w-tourist`, etc.), `created_by = 'migration'`, `active = 1`.
      `guide_checklist`/`verifiability_notes` deliberately left
      null/flagged rather than backfilled as "passing" — these 40 predate
      the five-test guide and have **not** been re-reviewed against it by
      this migration; that's a real follow-up worth doing separately, not
      a claim this migration makes for you.
- [x] Applied to the **local** D1 dev database and round-trip verified: a
      script re-queried all 40 rows and diffed every field (title, desc,
      tokens, cadence, cat, verify_type, proof_type, streak_target, active,
      created_by) against the source — **zero mismatches**. Also confirmed
      `SELECT * FROM dev_challenges WHERE active = 1` (what
      `GET /challenges/custom` actually runs) returns the right 15/17/8
      daily/weekly/monthly split.
- [x] **Caught and fixed two narrow resolvers that would have silently
      broken once the static catalog emptied** (found by grepping every
      direct `CHALLENGE_CATALOG`/`CHALLENGES` usage before touching either,
      not by assumption):
  - `server/src/duels.ts`'s `handleCreateDuel` read
    `CHALLENGE_CATALOG[challengeId]` directly instead of going through
    `resolveBaseCatalogEntry` — meant duels could only ever be created
    against a static-catalog id, never a local/dev/timed one. Fixed to use
    `resolveBaseCatalogEntry` (async), matching the pattern `verify.ts` and
    `complete.ts` already use.
  - `src/app/friends.tsx`'s `challengeTitle(id)` looked up a duel's display
    title from the static `CHALLENGES` array only, falling back to the raw
    id if not found — would have shown ids like `d-water` instead of
    "Chug a gallon of water" for every migrated task. Fixed to use
    `findChallengeById` from `store.ts` (checks local + custom too).
  - `src/app/dev-boost-form.tsx` also reads `CHALLENGES` directly for its
    boost-target picker, but already separately spreads in
    `customChallenges` too — no fix needed, migrated tasks show up via that
    second source once the static array is empty.
- [x] Removed the 40 entries from `CHALLENGE_CATALOG` in
      `server/src/tokens.ts` (now an empty, documented `{}` — kept rather
      than deleted, since `CatalogEntry`/`Cadence`/`VerifyType`/`ProofType`
      are still used throughout `server/src`) and emptied `CHALLENGES` in
      `src/lib/data.ts` to `[]` with an explanatory comment. Both
      typecheck clean.
- [x] Updated `docs/challenge-writing-guide.md`'s header note: it no longer
      says "the static catalog only" — it now points at `dev_challenges`
      as the thing being authored, with a note that the old static array
      was migrated in via `0020_migrate_static_challenges.sql`.

### Shipped: both gated actions run, with an unplanned detour

Both ran with explicit user confirmation, in order, and are now live:

1. **`wrangler d1 migrations apply sidequest-db --remote`** — first attempt
   failed: `0015_rewards_interest.sql` errored with `table
   rewards_interest already exists`. Investigated rather than forced
   through: remote D1's `d1_migrations` bookkeeping table only had
   migrations through `0014_user_avatar.sql` recorded, but the actual
   schema (verified via `PRAGMA table_info`/`sqlite_master` — not assumed)
   already had `rewards_interest`, `dev_challenges`, `token_boosts`, and
   `timed_challenges` (migrations 0015-0018), including 0018's
   `place_lat`/`place_lng`/`radius_meters` columns, but **not** 0019's new
   columns. Conclusion: migrations 0015-0018 were applied to remote at some
   point outside `wrangler d1 migrations apply` (e.g. a direct
   `wrangler d1 execute --remote --file=`), so their bookkeeping rows were
   never written, but 0019/0020 genuinely hadn't run yet.
   - **Fix** (separately confirmed with the user before running, since it
     wasn't the literal command already approved): manually inserted the 4
     missing bookkeeping rows (`INSERT INTO d1_migrations (name) VALUES
     (...)`) to match verified reality, touching no app data or schema.
     Re-ran `wrangler d1 migrations apply sidequest-db --remote`, which then
     correctly applied only `0019_task_verification_fields.sql` and
     `0020_migrate_static_challenges.sql`.
   - Verified post-migration: remote `dev_challenges` has exactly 40 active
     `created_by = 'migration'` rows, 15/17/8 daily/weekly/monthly — same
     split as local.
2. **`wrangler deploy`** — succeeded (`sidequest-verify`, version
   `1cf1e8e5-27b8-44bf-a0fb-0b6dbba558f1`). Smoke-tested with an
   unauthenticated `GET /auth/me` against the live URL, got the expected
   `401` (not a crash), confirming the deploy booted cleanly.

**Note for future migrations against this database**: the `d1_migrations`
bookkeeping table cannot be trusted alone to reflect remote schema state —
confirmed drift exists from before this session. Spot-check actual schema
(`PRAGMA table_info`) rather than assuming `migrations apply`'s dry-run
list is complete, especially before any future migration that drops or
alters a column.

**Still open**: a full authenticated end-to-end pass (real photo through
`/verify` for a migrated id) hasn't been done — that's explicitly Phase 6's
job, not skipped here, since Phase 5's dashboard doesn't exist yet to
generate a task with verification hints to test against. Don't skip it
when you get there.

**Uncommitted**: none of this session's changes have been committed to git
yet (migrations, `verify.ts`, `dev-challenges.ts`, `catalog.ts`,
`tokens.ts`, `duels.ts`, `friends.tsx`, `data.ts`, this roadmap file,
`challenge-writing-guide.md`) — say the word when ready.

## Phase 4 — Automated guide enforcement ✅ done (2026-08-06)

- [x] In `parseChallengeBody` (`server/src/dev-challenges.ts`), added
      mechanical checks that don't require judgment:
  - **Red-flag verb warning**: `RED_FLAG_VERBS` (try/explore/be more/work
    on/think about/appreciate/embrace) checked against `title + desc` via
    word-boundary regex. Genuinely can't tell "try an Ethiopian restaurant"
    (passes) from "try new food" (fails) mechanically, so this is
    **non-blocking** — it's returned as a `warnings: string[]` array
    alongside the created/updated challenge in the API response, for the
    Phase 5 dashboard to surface to a human. Never causes a save to fail.
  - **Photo/screenshot text check**: ported the exact three-part check that
    used to live in `CHALLENGES.forEach` at the bottom of `src/lib/data.ts`
    (title/desc must mention "photo" or "screenshot"; `proofType`
    'screenshot'/'either' requires the literal word "screenshot"; `proofType`
    'camera' requires "photo") into `parseChallengeBody` itself, so it's
    enforced on every DB write (create and full-body update), not just at
    static-array module load time. **Blocking**, matching the old code's
    `throw` — this exact bug class shipped 20+ times before the original
    check existed.
  - **`streakTarget` required when `verify === 'streak'`**: already present
    from Phase 1 (`parseChallengeBody`'s existing block) — confirmed still
    intact, no change needed.
  - **`guide_checklist` gate before publish**: added `isGuideChecklistComplete`
    (all five `GUIDE_CHECKLIST_KEYS` explicitly `true`). Enforced at the two
    places a row can transition to `active = 1`:
    - `handleAdminCreateChallenge` — new optional `active` field in the
      create body (defaults to `true` to match pre-Phase-4 behavior when
      omitted); if `active` resolves `true` and the checklist isn't
      complete, the create is rejected with a 400 explaining to send
      `active: false` to save as a draft instead. The INSERT's `active`
      column changed from a hardcoded `1` to a bound param.
    - `handleAdminUpdateChallenge`'s bare `{"active": true}` toggle path —
      checked against the **existing** row's stored `guide_checklist`
      before flipping it on.
    - Deliberately **not** enforced on the full-body update path, which
      never touches the `active` column at all (only the bare toggle does)
      — matches the literal requirement ("before a row can be **set**
      `active = 1`"), not a broader "active rows must always have a
      complete checklist" invariant.
- [x] Left routine-breaking / photo-fakeability / cadence-scope judgment as
      dashboard-visible fields (`verifiability_notes`, `guide_checklist`)
      that a human fills in, per decision 4 — no LLM-in-the-loop gate added
      for these.
- [x] **Verified no regression against the 40 migrated rows**: they were
      inserted directly by `0020_migrate_static_challenges.sql` with
      `active = 1`, bypassing this API entirely, so the new create/publish
      gate never touches them retroactively. Confirmed against local D1:
      `SELECT COUNT(*) FROM dev_challenges WHERE active = 1 AND created_by
      = 'migration'` still returns 40 after this phase's changes.
- [x] `npx tsc --noEmit` on `server/` — clean, no type errors.
- **Not done**: a live round-trip through the actual admin API (create/
  update HTTP calls hitting these new checks) — there's no dashboard yet
  to drive that from (Phase 5), and no other client currently authors a
  fresh task through `handleAdminCreateChallenge`/`handleAdminUpdateChallenge`
  with these fields set. Logic was verified by typecheck plus comparison
  against the pre-existing `data.ts` check it mirrors, not by an actual
  HTTP round trip. Covered by Phase 6's end-to-end pass once Phase 5 exists.

## Phase 5 — Standalone web dashboard ✅ built and smoke-tested locally (2026-08-06)

- [x] New lightweight web app: Vite + React + TypeScript, hand-scaffolded
      (not `npm create vite` interactively) at `dashboard/` — a sibling of
      `server/`, not part of the Expo app bundle at all. `dashboard/package.json`
      has a `deploy` script (`wrangler pages deploy dist --project-name=
      gumpa-dashboard`) for later, **not run yet** — Cloudflare Pages deploy
      is a production-affecting action, same gating as `wrangler deploy`/
      `wrangler d1 execute --remote`. Say the word when ready.
- [x] Auth: `dashboard/src/pages/Login.tsx` calls the existing
      `POST /auth/login` (`dashboard/src/api.ts`'s `login`), stores the JWT
      in `localStorage`, sends it as `Bearer` on every `/admin/*` call. No
      new auth system. A non-developer login sees a plain "not found" state
      (mirrors `requireDeveloper`'s 404-not-401 treatment, same as the Expo
      dev panel).
- [x] Views (`dashboard/src/pages/`):
  - `TaskList.tsx` — active + inactive, filterable by cadence/category/
    active state.
  - `TaskForm.tsx` — one form for both create and edit: title, desc,
    tokens, cadence, cat, verify, proof type, streak target (conditional),
    location (plain lat/lng/radius number inputs — **no map picker**,
    documented in-UI as a known gap versus the Expo dev panel's
    `LocationPickerMap`, use that instead for now if a task needs one),
    proof_accept, proof_reject, the five-item guide checklist,
    verifiability_notes. Create posts to `handleAdminCreateChallenge`
    (`POST /admin/challenges`); edit calls `handleAdminUpdateChallenge`
    (`PATCH /admin/challenges/:id`) for the full body, then a separate bare
    `{"active": ...}` PATCH if the Active checkbox changed — same two-call
    pattern `src/app/dev-challenge-form.tsx` already uses, kept consistent
    rather than reinvented.
  - Prompt preview: a "Load exact /verify prompt" button (existing tasks
    only, since it needs a stored row) calls the new
    `GET /admin/challenges/:id/preview-prompt` endpoint and renders the
    literal string.
  - Delete: presented as a plain "Delete" button calling
    `handleAdminDeleteChallenge` (`DELETE /admin/challenges/:id`) — soft
    delete only, exactly per spec, no hard-delete path added anywhere. A
    "Reactivate" button appears on inactive rows, calling the bare
    `{"active": true}` PATCH.
  - Non-blocking `warnings` (Phase 4's red-flag-verb check) are surfaced in
    an inline banner after save, not silently dropped.
- [x] Extended the admin API surface exactly as suggested rather than
      duplicating prompt logic: `server/src/verify.ts`'s `buildPrompt` is
      now exported and reused as-is by a new `handleAdminPreviewPrompt` in
      `server/src/dev-challenges.ts`, wired at
      `GET /admin/challenges/:id/preview-prompt` in `server/src/index.ts`.
      Works on inactive/draft rows too (developer wants to check the prompt
      *before* publishing).
- [x] **Found and fixed a real cross-cutting bug while building this**:
      `server/src/http.ts`'s `CORS_HEADERS` only listed `GET, POST, OPTIONS`
      in `Access-Control-Allow-Methods`. The Expo app never hit this because
      CORS is a browser-only mechanism (native `fetch` ignores it), but the
      dashboard runs in a real browser and calls `PATCH`/`DELETE` — those
      would have silently failed every edit/delete/toggle/reactivate/delete
      call via a failed preflight. Added `PATCH, DELETE` to the allowed
      methods list.
- [x] **Verified end-to-end in a real browser**, not just curl: ran
      `wrangler dev` locally against local D1 (temporarily set
      `DEV_USER_ID` in `server/.dev.vars` to a throwaway signup, reverted
      after), ran the dashboard's own Vite dev server against it, and drove
      it with Playwright (`playwright-core`, already present in the repo's
      root `node_modules` from the `run-gumpa-mobile` skill): logged in, saw
      the 40 migrated tasks, opened the new-task form, tried to publish with
      an unchecked guide checklist (got the expected 400 + inline error
      banner), checked all five boxes, created the task, opened it back up,
      loaded its real `/verify` prompt, and deleted it. No unexpected
      console/page errors — the only console error captured was the
      intentional 400 from the checklist-gate test itself. Screenshots
      confirmed the list and form render cleanly. All throwaway local D1
      rows and the temporary `DEV_USER_ID` were cleaned up afterward; the
      real `.dev.vars` is back to its pre-session state.
- **Not done / deferred**:
  - No location picker map (plain number inputs instead) — noted above.
  - Not deployed to Cloudflare Pages yet — needs your explicit go-ahead
    (production-affecting, gated per `AGENTS.md`).
  - The Expo-side `src/lib/admin-api.ts`'s `AdminChallenge` type wasn't
    extended with the Phase 1 fields (`proofAccept`/`proofReject`/
    `verifiabilityNotes`/`guideChecklist`) — the mobile dev panel still
    only edits the pre-Phase-1 fields. Not required for Phase 5, but worth
    doing if the mobile dev panel is meant to stay a real fallback surface
    per decision 3, rather than just bit-rotting.

## Phase 6 — Verification pass (do this before calling any phase "done")

- [ ] Re-run the diff script from Phase 3 one more time after all phases
      land, to confirm nothing drifted during Phase 4/5 work.
- [ ] Manually create one new task end-to-end through the dashboard, submit
      a real photo against it through the app, confirm `/verify` uses the
      per-task hints (check the actual outbound Anthropic request body, not
      just the verify result).
  - [ ] Follow the [verify](../.claude/skills) skill's spirit here even
      though this is a backend/data change: exercise the real flow (create
      task → app shows it as a suggestion → submit photo → verify → complete
      → appears in feed), don't stop at "the migration script ran."
- [ ] Confirm a pre-existing completed task's history (a post referencing a
      migrated static id) still renders correctly — the id-stability
      requirement from Phase 3 is only real if this is checked, not assumed.
