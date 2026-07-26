# Writing Sidequest challenges

Guidelines for anyone (human or AI) adding entries to `src/lib/data.ts`'s
`CHALLENGES` array. Read this before writing new tasks.

## The core rule: self-directed and verifiable

A challenge must be completable **entirely through the user's own action**,
with an **unambiguous moment where it's done** — one you can photograph.
There is no honor-tap fallback: every challenge, without exception, is
verified by a photo.

This is why "Make a new friend" doesn't work: it requires another person to
reciprocate, and there's no clean threshold for when an acquaintance becomes
a "friend." Compare that to "Create an Old Fashion" — you either made the
drink or you didn't, and the finished glass is a photo waiting to happen.

Run every candidate task through both checks before adding it:

1. **Self-directed** — can the user finish this alone, without anyone else
   agreeing, showing up, or reciprocating? If completion depends on another
   person's cooperation, rewrite it around the user's own action instead
   (see "Fixing social tasks" below).
2. **Verifiable** — is there a specific moment or artifact that proves it
   happened? If you can't picture the photo, the task is too vague. Every
   challenge is photo-verified — there is no honor-tap option — which maps
   to the `verify` field:
   - `photo` — one photo, one completion. The default for anything with a
     visual result (a drink, a dish, a view, a finished page).
   - `streak` — N separate photo check-ins across the period, one per
     calendar day, for things that happen repeatedly in different moments
     (`3 workouts this week`, `12 workouts this month`). Requires
     `streakTarget`.

   For tasks with no natural finished artifact (an internal act, a
   conversation, a call), the fix is a **photo of the moment right after** —
   at your desk after speaking up, in your space right after meditating, a
   selfie right after the conversation. It doesn't visually prove the act
   itself, but it pins down an unambiguous "this happened, right here, right
   now" moment, which is the actual bar.

   For tasks that are inherently digital (a tracked number, a sent message, a
   transfer, an app milestone), a **screenshot of that app is the photo** —
   say so explicitly in the `desc` (e.g. "Screenshot your step-counter app
   showing the total") so the verifier knows a screenshot is expected here,
   not a workaround. Don't reach for a screenshot as a shortcut for
   real-world tasks that have an actual physical moment to photograph
   instead.

   For absence/negative-behavior tasks (a no-spend day, no social media
   before noon), check whether the absence itself is trackable by a device
   (screen-time apps genuinely show zero usage in a window) before falling
   back to rewriting the task into a different, physically photographable
   action.

## Name the specific thing, not the category

"Create an Old Fashion," not "make a cocktail." "Do 20 push-ups," not
"exercise more." A vague category forces the user to invent the actual task
themselves — the app should have already done that work.

## Fixing social tasks

Social/relationship challenges are the most common source of unverifiable,
other-dependent tasks. The fix is almost always to **name the user's specific
action**, not the relationship outcome:

| Instead of (outcome, depends on others) | Write (action, self-directed) |
|---|---|
| Make a new friend | Invite one acquaintance to a specific low-stakes hangout (coffee, a walk) |
| Plan an event for 4+ people | Send the invites and pick the date/place for a specific gathering |
| Organize a hangout | Text three people proposing a specific plan this week |

The user can always execute the "write" column regardless of how the other
person responds — the challenge is complete the moment they've done their
part.

## Cadence sets scope, not vagueness

- **Daily** — a few minutes to an hour, done today.
- **Weekly** — a single sit-down project: one afternoon or evening, one
  specific deliverable (a recipe, a drink, a skill drill).
- **Monthly** — bigger in scope or duration (a streak, a milestone, a
  harder skill), but still one specific, self-contained accomplishment —
  never an open-ended social or relationship goal.

## Checklist before adding a challenge

- [ ] Named the specific thing (not a category)
- [ ] Completable by the user alone — no one else has to agree or show up
- [ ] Has a real photo moment — a finished artifact, an immediate after-photo, or (only if genuinely digital) a named screenshot
- [ ] Scope matches its cadence
- [ ] Description is one punchy, concrete sentence — no filler
