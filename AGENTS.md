# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Writing challenges

Before adding or editing anything in `src/lib/data.ts`'s `CHALLENGES` array,
read `docs/challenge-writing-guide.md`. Every task must be self-directed
(completable without anyone else's cooperation) and verifiable (a clear
moment/photo that proves it happened) — not a vague category or a social
outcome that depends on another person.

# Product scope

Gumpa is built for the general public, not a closed circle of friends and family. Treat every user as untrusted and every feature as public-facing when making design or implementation decisions:

- Validate and rate-limit on the server — never trust client-supplied data, and don't assume good-faith usage.
- Accounts default to private (posts only reach the friends feed); users opt in to the public feed per-account via Profile. Assume strangers will see and be seen by other strangers on the public feed once they do. Factor in moderation, reporting, and blocking even before those exist — call it out as a gap when a feature touches the feed without them.
- Auth now has password hashing + JWT sessions, per-IP rate limiting on login/signup, email verification, and password reset (all live on the deployed worker). Known gap: transactional email goes through Resend's shared sending domain (`onboarding@resend.dev`), which can only deliver to the Resend account owner's own address — verification/reset emails will silently fail to reach any other real user until a custom domain is verified with Resend (DNS records added there). Don't imply email delivery works for real users until that's done.
- Quest photos are real people's real-time proof content — treat them as sensitive by default, not as disposable app data.
- The backend runs on Cloudflare's free tier (D1, R2, KV, Workers). Flag when a proposed feature could meaningfully change usage or cost at real public scale.

# Caching & failure handling

Nothing that can fail should cache that failure permanently. A "not found" / "nothing here" result is a snapshot of what the code could produce *right now* — not a fact about the world that's true forever. This project changes constantly, so a fix shipped tomorrow can turn today's real failure into tomorrow's success — but a permanent negative cache means the fix silently never takes effect for anything that already failed once. (Confirmed the hard way: `city-image.ts` cached a failed Wikipedia lookup for NYC forever under the old single-attempt code; deploying an improved lookup chain later didn't fix NYC at all, because the cache short-circuited before the new logic ever ran — it took a manual D1 cleanup to unstick it.)

- Any cache of a negative/failure/empty result needs its own (short) TTL, separate from — and shorter than — a success TTL. Never write `if (cached) return cached` without also checking whether the cached value represents success or failure.
- When shipping a fix for a bug that could already be cached, stored, or otherwise persisted as a failure, explicitly check whether existing rows/state need clearing, or will naturally expire on their own — don't assume redeploying the code alone re-triggers everything downstream of it. Verify the fix against the real, previously-broken case, not just a fresh/never-cached one.

# Writing style

- Never use emojis in app UI. Where an emoji would otherwise mark a tab, button, or status (lock, coin, streak, etc.), draw a custom line-art SVG icon instead, matching the existing style in `src/components/rail-icons.tsx` (24x24 viewBox, ~2px stroke, no fill unless the mark needs a filled dot/circle).
- Never use em dashes in user-facing app copy (UI text, toasts, challenge titles/descriptions) or in your own written prose to the user. Rewrite with a period, comma, or parentheses instead.

# Working style

The user wants proactive execution: if there's something you can just do yourself (run a command, install a dependency, fix a bug you noticed, apply a migration file you just wrote), do it rather than stopping to ask — don't leave follow-through steps for the user to run manually. This is a solo personal project; move fast.

Exception: production-affecting actions against the live Cloudflare Worker/D1 database (`wrangler deploy`, `wrangler d1 execute --remote`, etc.) are gated by the harness's own safety layer regardless of this instruction — it requires the user to name the specific action/target explicitly in the moment, not just grant general autonomy. When blocked this way, don't try to work around it; just ask the user to confirm the specific command, then run it immediately once they do.
