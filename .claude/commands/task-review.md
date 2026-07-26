---
description: Audit the most recently completed task against CLAUDE.md/AGENTS.md and actual runtime behavior, fixing anything that was claimed done but isn't.
---

You are auditing the task you (Claude) just finished in this conversation — the real, specific one, not a hypothetical. This command exists because of a recurring failure mode on this project: a change gets reported as complete (typecheck passed, code reads correctly) without ever being observed running, and it turns out incomplete or flat-out not applied (e.g. a card outline that was "added" but never actually appeared in the app on reload). Your job is to close that gap, not just re-read the diff and nod.

## 1. Scope it precisely

Use `git status` / `git diff` and the recent conversation to identify exactly which files the most recently completed task touched — not the whole branch, just that task. If the task was pure discussion/analysis with no code change, say so and stop.

## 2. Re-check against CLAUDE.md / AGENTS.md

Read `AGENTS.md` fresh — don't rely on memory of what it says, it may have changed. Walk the actual diff against every section that applies:

- **Challenge data** — if `src/lib/data.ts`'s `CHALLENGES` array changed, re-run every new/edited entry through `docs/challenge-writing-guide.md`'s checklist: self-directed, verifiable with a real photo moment, names the specific thing (not a category), cadence matches scope.
- **Product scope** — if the change touches client-supplied input, the public feed, moderation/reporting/blocking-adjacent behavior, or photo/proof handling, check it against the Product scope section and flag any gap it calls out (e.g. missing rate-limiting, trusting client data).
- **Production actions** — if the change touched the live Worker or D1, confirm every `wrangler deploy` / `wrangler d1 execute --remote` / KV write actually got explicit in-the-moment confirmation before running, per the harness gate — not just a standing "go ahead."
- **Working style** — confirm nothing shortcut the "just do it" expectation (unnecessary stops to ask permission for reversible local work) and nothing scope-crept beyond what was asked.

## 3. Actually verify it works — this is the step that keeps getting skipped

`tsc --noEmit` passing, or "the code looks right on a re-read," is not verification. It proves the code is well-typed, not that the feature works. For each piece of the task:

- **UI/frontend change**: launch the app (the `run` skill, or a project-specific run skill if `/run-skill-generator` has since created one) and get a real screenshot of the affected screen in the state the change is supposed to produce — e.g. a local/destination task card, an empty state, an error toast. Compare what you see against what was claimed. Do not re-read the source a second time and call that verification.
- **Server/API change**: actually call the endpoint (curl, or replay the real request path) and read the live response — don't just re-read the handler.
- **Data change**: run whatever validation already exists (e.g. the `CHALLENGES.forEach` streak-target check) and spot-check a couple of the new/edited entries by eye against the guide.
- If something genuinely can't be verified in this environment (no simulator, no camera, no way to trigger the real trigger condition), say so explicitly instead of assuming it's fine — never claim a UI result you didn't actually observe.

## 4. Fix what's wrong, then report

If verification turns up a gap — code present but not visually correct, a rule from AGENTS.md not actually followed, a claim that doesn't hold up, stale cached state masking the real result — fix it now instead of just flagging it for later. This command exists to close gaps, not catalog them for someone else to close.

End with a short, concrete report:
- What was checked
- What was already correct
- What was fixed (with the specific file/line)
- Anything you could not verify, and exactly why (missing simulator, no camera access, etc.) — not a vague "should be fine"
