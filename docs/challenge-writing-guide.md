# Writing Gumpa challenges

Guidelines for anyone (human or AI) adding a developer-authored task to the
`dev_challenges` table (see `server/src/dev-challenges.ts` and
`docs/task-database-roadmap.md`). Read this before writing new tasks. What
used to be a separate hardcoded static catalog (`src/lib/data.ts`'s
`CHALLENGES` array) was migrated into `dev_challenges` as of
`server/migrations/0020_migrate_static_challenges.sql` — both catalog
provenances go through the same guide now. Server-generated local
challenges (tied to a real named nearby venue, see
`server/src/local-challenges.ts`) already satisfy these by construction and
don't need a separate pass.

## The five tests

Every static challenge must pass all five before it ships. Reject or
rewrite anything that fails — there's no partial credit.

1. **Routine-breaking** — completing it must change something about the
   user's day: a new place, a new object, a new activity, or a rerouted
   habit (redirecting an existing default behavior, not just adding a
   passive one). If it could be done without leaving normal routine — the
   same room, the same habits, nothing new introduced — it fails. This is
   why passive self-improvement tasks with no new place/object and no
   redirected behavior (reading, meditating, journaling, checking a
   balance) don't survive here even though they're perfectly photo-provable:
   nothing about the day actually changes.
2. **Named, not categorized** — it names a specific thing to do, not a
   category to pick from. "Try a Peruvian restaurant" passes. "Try new
   food" fails. "Do 20 push-ups" passes. "Exercise more" fails. A task
   description that lists several category options ("a museum, a park, a
   class") is still a category — pick one and name it.
3. **Photo-provable in one shot** — a stranger looking at the photo plus
   the task text should be able to tell, without trusting the user's word,
   that it was completed. Ask explicitly: **could someone fake this photo
   without doing the task?** If yes, rewrite it around a physical artifact,
   location, or receipt-like detail instead of an internal state or an
   unverifiable other person.
   - A selfie "right after talking to a stranger" is satisfied by any
     selfie, with anyone, taken anytime.
   - A screenshot of a text you sent has the same problem — you can send it
     to yourself or anyone and the screenshot looks identical either way.
   - Tasks with no natural finished artifact (an internal act, a
     conversation) get a pass only via a **photo of the moment right
     after** (mid push-up, right after a cold shower) — that's accepted
     because the task itself is still routine-breaking and specifically
     named; it isn't a license to wave through "prove an internal state"
     tasks generally.
   - A photo-authenticity/approval system (catching a reused, staged, or
     borrowed submission) is future work, not built yet. Don't add a task
     whose only defense against cheating would be that system.
4. **Cadence-appropriate scope** — matched to how much planning it takes:
   - **Daily** — zero-planning, fits inside a normal day: a new block to
     walk, a new ingredient to cook with, a different seat or spot than
     usual.
   - **Weekly** — a little intention or a short trip: a museum or park
     never visited, a class, a restaurant outside the usual neighborhood.
   - **Monthly** — a real goal requiring saving, scheduling, or multiple
     steps: a day trip to another town, signing up for a course, finishing
     a 5K.
   
   A task scoped for the wrong cadence fails even if it passes everything
   else — a single sit-down task ("build a budget") doesn't belong at
   monthly, and a multi-step goal doesn't belong at daily.
5. **No red-flag words standing in for specifics** — treat *try, explore,
   be more, work on, think about, appreciate, embrace* as a signal to stop
   and check test 2, not an automatic fail. "Try new food" and "Explore a
   new neighborhood" fail because what follows the verb is still a
   category. "Try an Ethiopian restaurant" keeps the verb but names the
   actual thing, so it passes — the word was never the problem, the missing
   specific was. If you can't make what follows the verb fully specific,
   replace the whole phrase with a concrete action instead.

Self-directedness still matters on top of all five: can the user finish
this alone, without anyone else agreeing, showing up, or reciprocating? If
completion depends on another person's cooperation, rewrite it around the
user's own action instead (see "Fixing social tasks" below) — this is
usually the same fix that gets it through test 3 anyway.

## Fixing social tasks

Social/relationship challenges are the most common source of both
self-directedness and photo-provability failures, since "prove you
interacted with someone" almost always reduces to a photo/screenshot that
would look identical whether the interaction was real or not.

Naming the user's specific action (not the relationship outcome) fixes
self-directedness, but **does not by itself fix photo-provability** — don't
stop at self-directed and call it done:

| Outcome (depends on others, don't use) | Self-directed but still fakeable (don't use either) | Self-directed AND photo-provable |
|---|---|---|
| Make a new friend | Invite one acquaintance to a hangout, screenshot the text | *(no fix yet — cut it; see below)* |
| Plan an event for 4+ people | Send the invites, screenshot the message | *(no fix yet — cut it; see below)* |
| Organize a hangout | Text three people a plan, screenshot the text | *(no fix yet — cut it; see below)* |
| Share a meal with someone, phone-free | *(same idea, no photo spec at all)* | Photograph the table with both phones face-down — the artifact is the phones, not a claim about who's across from you |

The middle column used to be this guide's recommended fix. It isn't one:
sending a text costs nothing and can go to anyone, including yourself, so
the screenshot proves a message was sent, never that the claimed social
interaction happened. If a social task's real deliverable is a costly,
tangible artifact — a handwritten and stamped letter, an active video call
screenshot, a note you physically wrote and photographed before giving it
away — keep it; the artifact carries the proof regardless of who receives
it. If the only available proof is a screenshot of an outbound message or a
selfie claiming an unverifiable stranger/acquaintance was involved, cut the
task rather than ship something that only *looks* photo-verified.

## Proof type

Every challenge also needs a `proofType` in both `src/lib/data.ts` and its
mirror in `server/src/tokens.ts` (server-authoritative, never trusted from
the client):

- `'camera'` — a real-world moment; submitted only via the live in-app
  camera, never the gallery. Default for anything photo-provable in the
  usual sense.
- `'screenshot'` — proof of another app's UI (a step count, a screen-time
  total, a transfer confirmation). The desc **must actually say
  "screenshot"** — a validation check in `data.ts` enforces this.
- `'either'` — accepts both (rare; only for a task where a photo of the
  activity and a screenshot of a tracking app are equally valid proof).

Don't write a new challenge whose desc says "screenshot" without setting
`proofType` to `'screenshot'`/`'either'` — the client only offers the
Screenshots-album picker when the challenge declares it, and camera-only
capture can't produce a screenshot at all.

## Checklist before adding a challenge

- [ ] Routine-breaking — a new place, object, activity, or rerouted habit, not just business as usual
- [ ] Named the specific thing (not a category, not a menu of options)
- [ ] Completable by the user alone — no one else has to agree or show up
- [ ] Photo-provable in one shot — could someone fake it without doing the task? If yes, rewrite around a physical artifact/location/receipt
- [ ] Scope matches its cadence (zero-planning / short trip / real multi-step goal)
- [ ] No red-flag verb (try/explore/be more/work on/think about/appreciate/embrace) standing in for a missing specific
- [ ] Description is one punchy, concrete sentence — no filler
- [ ] `proofType` set in both `src/lib/data.ts` and `server/src/tokens.ts`, matching whether the desc says "photo"/"screenshot"
