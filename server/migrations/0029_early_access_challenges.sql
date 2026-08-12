-- A plain developer-controlled toggle, not a timestamp/auto-expiry: an
-- early_access dev_challenges row is visible (GET /challenges/custom) and
-- completable (/verify, /complete) only to Gumpa+ subscribers, until the
-- developer manually flips it back off to push the task to everyone. Per
-- explicit direction (2026-08-13): "early access challenges should only be
-- toggable by the developer" — no automatic expiry, no user-facing control.
-- See docs/gumpa-plus-perks-roadmap.md Phase 4.
ALTER TABLE dev_challenges ADD COLUMN early_access INTEGER NOT NULL DEFAULT 0;
