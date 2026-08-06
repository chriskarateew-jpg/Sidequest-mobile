---
name: live-volume-fix
description: Work the next open item in docs/live-volume-checklist.md (the tracked list of production-readiness fixes from docs/Live-Volume.md) — one item per run, fully investigated, fixed, and verified before being checked off. Use when asked to continue the live-volume checklist, work the next volume/launch-readiness fix, or make progress toward publishing live.
---

This drives `docs/live-volume-checklist.md` to completion, one item at a
time, before Gumpa goes live to real users. The whole point of this skill is
**no gaps and no half-fixes** — that means doing exactly one item per
invocation, verifying it for real before checking it off, and never batching
multiple items together even if the next one looks trivial.

## Process

**1. Read state, and check the two files are actually in sync.** Read
`docs/live-volume-checklist.md` (the tracker — source of truth for status)
and `docs/Live-Volume.md` (the findings report). The checklist does **not**
update itself when the report changes — only `docs/live-volume-audit-prompt.md`'s
step 9 does that. Before picking an item, sanity-check: does every item in
the report's Recommendations section have a corresponding `LV-N` item
(in whichever phase it's filed under), and does every open `LV-N` item still
correspond to something the report actually says? If they've clearly diverged (a recommendation in the report
has no matching checklist item, or a checklist item describes something the
report no longer mentions), stop and tell the user the audit prompt needs to
be re-run to reconcile them first — don't guess at the reconciliation
yourself mid-fix-run, and don't silently work from a stale checklist. Beyond
that sync check, treat `Live-Volume.md` as a dated snapshot — code may have
moved since even the checklist item was written, so never trust an old line
number without re-reading the actual current file.

**2. Pick the item.** The checklist is organized into numbered phases
(Phase 1, Phase 2, ...) under "Progress at a glance," each phase a plain
checkbox list. Work **phase by phase, top to bottom**: find the
lowest-numbered phase that still has an unchecked box, and within it take
the first item that is `TODO` or `IN PROGRESS` (resume an `IN PROGRESS` item
rather than starting a new one). Don't jump ahead to a later phase while an
earlier phase still has an open, non-deferred item — the phases are ordered
that way on purpose (e.g. Phase 2's infrastructure decision matters more
than Phase 3's code fixes, because it changes the numbers those fixes are
judged against). If an item is `BLOCKED`, check whether the blocker is
resolved; if not, note it's still blocked and move to the next item *in the
same phase* before considering the next phase. If every phase is either
fully checked or `DEFERRED`, say so plainly and stop — don't invent new work.

Skip (don't attempt) any item marked `DEFERRED`, and don't let a deferred
phase (Phase 5 today) block progress on earlier phases — those need their
own planning session (see LV-7 in the checklist for why), not a slot in this
one-item loop.

**3. Re-investigate before touching anything.** Re-read the actual current
file(s) the item concerns. If the described problem is already fixed, no
longer applies, or the code has changed enough that the original write-up is
wrong, don't force a change — mark the item `VERIFIED` (or add a note and
set `DONE (unverified)` → `VERIFIED` as appropriate) with a log entry
explaining what you found, and stop. That's a legitimate, complete outcome
for a run of this skill.

**4. If the item needs a human decision, not code** (LV-0's Cloudflare plan
check, LV-1's upgrade, LV-6's Anthropic console check) — ask the user
directly, or use `AskUserQuestion` if it's a genuine choice between options.
Record the answer in the checklist's Log section for that item, update its
status, and stop. Don't guess at something only the user's dashboards can
answer.

**5. If the item needs a code fix:**
- Set its status to `IN PROGRESS` in the checklist immediately (so a
  crashed/interrupted run leaves an honest trail, not a silent gap).
- Implement *only* this item's acceptance criteria. Follow this repo's
  existing conventions (CLAUDE.md/AGENTS.md, and the surrounding code's own
  style) — no drive-by refactors, no scope creep into adjacent issues even
  if you notice them (note anything you notice but don't fix in the log
  instead, so it doesn't get lost).
- If finishing the fix genuinely requires a production-affecting action —
  `wrangler deploy`, `wrangler d1 execute --remote`, or similar — stop and
  ask the user to confirm that specific command per AGENTS.md's "Working
  style" exception. Don't attempt to route around that gate. It's fine to
  land the local code change and leave deployment as the explicit next step
  you ask about.

**6. Verify for real.** A typecheck or lint pass is not verification for
anything that changes runtime behavior — actually exercise the fix, the same
way the item's own "Verification" section in the checklist describes (most
call for driving the running app/server, e.g. via the `run-gumpa-mobile`
skill or a direct request against a local `wrangler dev` instance, and
checking both the positive and negative case). If the item is fact-finding
rather than a code change (LV-0, LV-6), verification is just confirming the
answer was actually obtained, not assumed.

**7. Close it out.** Update `docs/live-volume-checklist.md` in two places:
- The item's own `**Status:**` line (`VERIFIED` if you confirmed it works,
  `DONE (unverified)` only if verification genuinely isn't possible yet and
  say why, `BLOCKED` if stuck on something outside your control), plus a
  dated log entry under that item summarizing what changed, how it was
  verified, and any follow-up worth noting.
- **The checkbox itself**, in the "Progress at a glance" section at the top
  — flip `- [ ]` to `- [x]` for that item, but **only when status is
  `VERIFIED`**. A `DONE (unverified)` or `BLOCKED` item stays unchecked; the
  checkbox means "genuinely finished," not "attempted." This is what makes
  the at-a-glance view trustworthy at a skim.

**8. Report and stop.** Tell the user, briefly: which item you worked, what
changed, how you verified it, which phase it's in, and what's next in the
queue (next open item, and whether it's still the same phase or a new one).
**Do not automatically continue to the next item** — that's what makes this
methodical instead of a rushed batch. The user re-invokes this skill (or
says "next") to continue.

## Ground rules

- One item per run. Always.
- Never mark something `VERIFIED` without having actually exercised the
  behavior it claims to fix.
- Never silently expand an item's scope — if you find a closely-related
  problem while working one, log it as a note rather than fixing it in the
  same pass, unless the checklist item's own acceptance criteria already
  covers it.
- Never deploy or run a remote/production D1 command without asking first,
  per AGENTS.md — this applies even mid-item, even if the user has approved
  other steps in the same run.
- If `docs/Live-Volume.md` itself looks stale relative to what you're
  finding in the code (new endpoints added, an item already fixed by
  unrelated work, etc.), say so — don't silently patch over the mismatch.
