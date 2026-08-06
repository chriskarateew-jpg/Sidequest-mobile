-- Per-task verification hints and verifiability record for dev_challenges
-- (see docs/task-database-roadmap.md Phase 1). All nullable: an existing
-- row with none of these set falls back to /verify's current generic
-- prompt exactly as before (see verify.ts's buildPrompt, wired up in
-- Phase 2) — this migration changes no existing behavior by itself.

-- Short guidance phrases spliced into the existing verification prompt
-- template, not a standalone prompt — see the length caps enforced in
-- dev-challenges.ts's parseChallengeBody.
ALTER TABLE dev_challenges ADD COLUMN proof_accept TEXT;
ALTER TABLE dev_challenges ADD COLUMN proof_reject TEXT;

-- Human-authoring record, never sent to Claude and never shown to end
-- users — an audit trail for docs/challenge-writing-guide.md's five tests.
ALTER TABLE dev_challenges ADD COLUMN verifiability_notes TEXT;

-- JSON blob of the five guide checks (routineBreaking, named, photoProvable,
-- cadenceAppropriate, noRedFlagVerbs), each a boolean. Phase 4 will require
-- all five true before a row can be set active=1; this migration only adds
-- the column.
ALTER TABLE dev_challenges ADD COLUMN guide_checklist TEXT;
