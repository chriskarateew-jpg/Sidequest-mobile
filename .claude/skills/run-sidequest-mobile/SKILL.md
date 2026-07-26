---
name: run-sidequest-mobile
description: Build, run, and drive the Sidequest (Gumption) Expo app in a headless container. Use when asked to start the app, take a screenshot of a screen, verify a UI change actually renders, or drive a signup/task-completion flow. No iOS/Android simulator is available here — this drives the web build with Playwright.
---

This is an Expo Router app (`react-native-web` is already a dependency), so
the way to actually see it render in this container is `expo start --web`
plus a headless Chromium driving it — there's no simulator here.
`chromium-cli` is not installed in this environment, so drive it via
`.claude/skills/run-sidequest-mobile/driver.mjs`, a small stdin-driven
Playwright REPL built for this project (same command-per-line shape as
`chromium-cli`, just hand-rolled). All paths below are relative to the repo
root.

## Prerequisites

Nothing beyond the repo's own `npm install` — Playwright is a devDependency
already, and Chromium was fetched once into `%LOCALAPPDATA%\ms-playwright`
via:

```bash
npx playwright install chromium
```

(Only needed the first time on a machine; skip if that directory already
has a `chromium-*` folder.)

## Setup

```bash
npm install   # includes playwright as a devDependency
```

No `.env` values are required to reach the login/signup screen or drive the
Tasks tab — `EXPO_PUBLIC_API_URL` is already loaded from the repo's `.env`
and points at the live deployed Worker, so signup/login are real API calls
against production.

**Create one throwaway test account once, then reuse it via `login` for
every future run** — `/auth/signup` is per-IP rate-limited server-side, and
repeated driver runs that call `signup` fresh each time *will* exhaust it
(confirmed: it took roughly half a dozen runs in one session to trip "Too
many signup attempts. Try again later."). Reserve `signup` for
specifically testing the signup flow itself.

```bash
node .claude/skills/run-sidequest-mobile/driver.mjs <<'EOF'
launch
nav http://localhost:8090
signup sidequest-test-account sidequest-test-account@example.com TestPass123!
quit
EOF
```

Then use `login sidequest-test-account@example.com TestPass123!` in every
script below instead of `signup`.

## Build

No separate build step — `expo start --web` bundles on the fly.

## Run (agent path)

**1. Start the dev server in the background and wait for the port:**

```bash
nohup npx expo start --web --port 8090 > /tmp/expo-web.log 2>&1 &
timeout 45 bash -c 'until curl -sf http://localhost:8090 >/dev/null 2>&1; do sleep 1; done'
```

Stop it when done: find the PID bound to the port and kill it — the `npx`
wrapper does not forward signals to the child, so `kill %1` alone won't
free the port.

```bash
netstat -ano | grep ":8090" | grep LISTENING   # note the PID in the last column
taskkill //PID <pid> //F
```

**2. Drive it via `driver.mjs`.** Pipe a script to stdin, one command per
line:

```bash
node .claude/skills/run-sidequest-mobile/driver.mjs <<'EOF'
launch
nav http://localhost:8090
login sidequest-test-account@example.com TestPass123!
dismiss-location-modal
click-tab Tasks
wait-for Today
scroll 500
screenshot 01-tasks
console-errors
quit
EOF
```

Screenshots land in `.claude/skills/run-sidequest-mobile/screenshots/`
(gitignored — ephemeral verification output, not source).

| command | what it does |
|---|---|
| `launch` | Opens headless Chromium + one page (420×900 viewport), wires up console/pageerror capture. Always first. |
| `seed-local` | Injects a fake local/destination-tied task (with `bgImage`) into `localStorage` under `sidequest_state_v1`, via `addInitScript` so it's there before the app's own `hydrate()` runs. **Must come before `nav`** — seeding after the app has already mounted does nothing. Use this to see a local-task card without real GPS (geolocation isn't available headlessly). |
| `nav <url>` | Full page load. **Only safe once, as the very first navigation.** See Gotchas — a second `nav` after auth logs you out. |
| `signup [user] [email] [pass]` | Clicks through to the signup form and submits. Args are optional — auto-generates a unique throwaway identity if omitted. Lands logged in (no email-verification gate blocks access). |
| `login <identifier> <password>` | Fills and submits the login form directly, for a pre-existing test account. |
| `dismiss-location-modal` | Clicks "Not now" on the post-signup location-onboarding modal if present, no-ops if not. **Call right after `signup`/`login`, before `click-tab`** — see Gotchas. |
| `click-tab <name>` | Client-side navigation via the bottom nav (`Tasks`, `Friends`, `Groups`, `Profile` — exact text match). **The only safe way to change screens once authenticated.** |
| `wait-for <text>` | Waits (15s timeout) for text to appear anywhere on the page. |
| `scroll <px>` | Scrolls the focused list down by `<px>`. Needed before screenshotting anything below the first screenful — see Gotchas. |
| `screenshot [name]` | Viewport screenshot to `screenshots/<name>.png`, also copied to `screenshots/screenshot.png` (stable "latest" path). |
| `console-errors` | Prints every captured `console.error`/`pageerror` as JSON. Check this before declaring success — a screen can render its shell while a fetch silently fails. |
| `quit` | Closes the browser. Always last. |

## Run (human path)

`npm run web` → opens a dev-server tab in your default browser. Ctrl-C to
stop. Not useful headlessly — no different from the agent path's step 1
except it also tries to launch a real browser window.

## Test

No test suite configured in this project yet (no `test` script in
`package.json`).

## Gotchas

- **`signup` is per-IP rate-limited on the live server and burns out fast
  under repeated driver runs.** It's a real API call against the deployed
  Worker (`server/src/auth.ts`), and after roughly half a dozen `signup`
  calls in one session it starts returning "Too many signup attempts. Try
  again later." with no other symptom (page renders fine, form just shows
  that error). Create one test account once, then use `login` for every
  subsequent run — see Setup.
- **Every fresh signup/login shows the location-onboarding modal, and it
  blocks the entire screen.** `LocationOnboarding` renders full-bleed
  whenever `localChallengesFetchedAt` is still null (i.e. always, right
  after signup), and it intercepts pointer events across the *whole*
  screen, not just its own card — a `click-tab Tasks` attempted while it's
  up fails after 30s with `<div>… subtree intercepts pointer events`, which
  reads like a targeting bug but is actually just an unhandled modal.
  Always run `dismiss-location-modal` right after `signup`/`login`.
- **`expo-secure-store`'s web shim does not survive a hard page reload.**
  The auth token is lost on a second `nav`/`page.goto` — you land back on
  the login screen with no error. This is a real product-relevant finding,
  not just a driver limitation: it means the web build can silently log
  users out on any full reload. Verified by reproducing it directly during
  driver development. Always use `click-tab` for in-app navigation after
  `signup`/`login`, never a second `nav`.
- **Playwright's `fullPage: true` screenshot does not capture below-the-fold
  content on this app.** Expo Router screens render their scrollable
  content in an internal `FlatList`/`ScrollView` div, not the document
  body, so `fullPage` only ever captures the initial viewport height (900px
  here) no matter what. Use `scroll <px>` before `screenshot` to reach
  anything further down (e.g. the "This week"/"This month" sections on the
  Tasks screen).
- **`wait-for Tasks` is ambiguous and can hang for the full 15s timeout.**
  "Tasks" matches both the Tasks screen's own content and the bottom nav's
  tab label, and Playwright's `.first()` can resolve to the nav label
  instance, which reports as present-but-hidden and never satisfies
  `waitFor`. Wait for text unique to the screen's body instead (e.g. `Today`
  on the Tasks screen).
- **`localStorage` key for seeded app state is `sidequest_state_v1`** — the
  Zustand store's AsyncStorage backend is plain `window.localStorage` on
  web, same key as native. Shape is `PersistedState` in `src/lib/store.ts`;
  a `Challenge` needs `bgImage` set for it to render as a local/destination
  card (see `src/lib/data.ts`'s `Challenge` type).
- **Never call `process.exit()` in the driver.** It does not wait for
  buffered stdout to flush — an earlier version of this driver called it in
  the `quit` handler and silently lost every `console.log` from the whole
  run except the last one or two lines. Let the process exit naturally
  once the browser is closed and stdin hits EOF.
- **`readline`'s `'line'` event does not wait for an `async` listener.**
  A heredoc hands stdin over all at once, so without an explicit queue,
  every command's handler fires back-to-back and races — `nav`/`signup`
  would start executing before `launch`'s `browser.newPage()` had resolved,
  against a still-null `page`. `driver.mjs` queues and drains commands
  strictly sequentially; don't remove that if you touch the dispatch loop.

## Troubleshooting

- **Driver prints almost nothing, no errors, just seems to skip most
  commands**: you're hitting one of the two concurrency/exit bugs above —
  confirm you're running the current `driver.mjs`, not a stripped-down
  copy.
- **`EADDRINUSE` starting the dev server**: a previous `expo start --web`
  is still bound to the port. `netstat -ano | grep ":8090"` and
  `taskkill //PID <pid> //F` (Windows) before relaunching.
- **Signup form fields don't fill**: placeholders are exact-text
  `Username`, `Email`, `Password (min 8 characters)` on the signup form —
  different from the login form's `Email or username` / `Password`. Using
  the wrong placeholder silently matches nothing and `fill()` times out.
- **"Too many signup attempts. Try again later." shown on the form**:
  you've hit the per-IP signup rate limit from repeated `signup` calls —
  switch to `login` with the persistent test account (see Setup) and wait
  out the window before using `signup` again.
