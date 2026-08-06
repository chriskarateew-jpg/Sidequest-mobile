#!/usr/bin/env node
// Gumpa — headless-Chromium REPL driver for the Expo web
// build, in the spirit of chromium-cli (which isn't installed in this
// environment). Reads one command per line from stdin, drives a single
// persistent page, writes screenshots to ./screenshots next to this file.
//
// Why this exists instead of chromium-cli: this project has no native
// simulator available in-container, but react-native-web is already a
// dependency, so `expo start --web` gives us a real browser-renderable
// build of the actual app (not a mock) to drive with Playwright directly.
//
// Usage: node driver.mjs   (then pipe commands via a heredoc — see SKILL.md)

import { chromium } from 'playwright';
import * as readline from 'node:readline';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS_DIR = path.join(__dirname, 'screenshots');
fs.mkdirSync(SHOTS_DIR, { recursive: true });

let browser = null;
let page = null;
const consoleErrors = [];

// Matches the shape src/lib/store.ts persists under this key on web (its
// AsyncStorage backend is window.localStorage there). Seeding it lets you
// get a local/destination-tied task card onto the Tasks screen without real
// GPS — geolocation isn't available headlessly. Must be seeded via
// addInitScript BEFORE the first `nav`, since it has to exist before the
// app's own hydrate() runs on mount.
function seedLocalState() {
  return {
    tokens: 120,
    xp: 0,
    completions: {},
    streak: { count: 0, lastDay: null },
    weekly: { key: null, earned: 0 },
    localChallenges: [
      {
        id: 'driver-seed-local-1',
        cadence: 'weekly',
        cat: 'explore',
        tokens: 75,
        title: 'Photograph a cast-iron facade on Greene Street',
        desc: "Document SoHo's ornate 19th-century building fronts and their intricate architectural details up close.",
        verify: 'photo',
        proofType: 'camera',
        bgImage: 'https://picsum.photos/seed/soho/1200/800',
        isLocal: true,
      },
    ],
    localChallengesFetchedAt: Date.now(),
    locationOptOut: false,
  };
}

async function cmd_launch() {
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 420, height: 900 } });
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));
  console.log('launched');
}

async function cmd_seedLocal() {
  await page.addInitScript((seed) => {
    window.localStorage.setItem('gumpa_state_v1', JSON.stringify(seed));
  }, seedLocalState());
  console.log('seeded gumpa_state_v1 (will apply on next nav)');
}

async function cmd_nav(url) {
  // Full page load — only safe for the FIRST navigation in a session. After
  // signup/login, expo-secure-store's web shim does NOT survive a hard
  // reload (the auth token is lost, you're bounced back to the login
  // screen) — use `click-tab` for everything after auth instead.
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  console.log('nav ->', page.url());
}

async function cmd_signup(username, email, password) {
  const stamp = Date.now();
  username = username || `uicheck${stamp}`;
  email = email || `uicheck${stamp}@example.com`;
  password = password || 'TestPass123!';

  await page.getByText("Don't have an account?", { exact: false }).click();
  await page.waitForTimeout(400);
  await page.getByPlaceholder('Username').fill(username);
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder('Password (min 8 characters)').fill(password);
  await page.getByText('Sign up', { exact: true }).click();
  await page.waitForTimeout(2500);
  console.log(`signed up as ${username} <${email}> ->`, page.url());
}

async function cmd_login(identifier, password) {
  await page.getByPlaceholder('Email or username').fill(identifier);
  await page.getByPlaceholder('Password').fill(password);
  await page.getByText('Log in', { exact: true }).click();
  await page.waitForTimeout(2000);
  console.log('login ->', page.url());
}

// Every fresh signup/login shows the "Real tasks, tied to real places near
// you" modal (src/components/location-onboarding.tsx) as long as
// localChallengesFetchedAt is still null, and it intercepts pointer events
// across the WHOLE screen — including the bottom nav — until dismissed.
// Call this right after `signup`/`login`, before any `click-tab`.
async function cmd_dismissLocationModal() {
  const notNow = page.getByText('Not now', { exact: true });
  if ((await notNow.count()) > 0) {
    await notNow.click();
    await page.waitForTimeout(400);
    console.log('dismissed location-onboarding modal');
  } else {
    console.log('no location-onboarding modal present');
  }
}

// Client-side nav only — bottom nav tabs are Tasks / Friends / Groups /
// Profile (see src/components/bottom-nav.tsx). This is the ONLY safe way to
// move between screens once authenticated; a full `nav` reload drops the
// session (see cmd_nav's comment).
async function cmd_clickTab(name) {
  await page.getByText(name, { exact: true }).click();
  await page.waitForTimeout(1500);
  console.log('clicked tab ->', name, '->', page.url());
}

async function cmd_waitFor(text) {
  await page.getByText(text, { exact: false }).first().waitFor({ timeout: 15000 });
  console.log('found:', text);
}

// Scrolls the focused list/page down — expo-router screens render lists as
// an internal scroll container, so Playwright's `fullPage` screenshot
// option does NOT capture content below the fold (it only extends to
// `document.body`'s scrollHeight, and the scrollable div is nested inside
// that at a fixed height). Scroll first, then screenshot the viewport.
async function cmd_scroll(amount) {
  await page.mouse.move(210, 450);
  await page.mouse.wheel(0, Number(amount) || 500);
  await page.waitForTimeout(500);
  console.log('scrolled', amount);
}

async function cmd_screenshot(name) {
  const file = path.join(SHOTS_DIR, `${name || 'screenshot'}.png`);
  await page.screenshot({ path: file });
  const latest = path.join(SHOTS_DIR, 'screenshot.png');
  fs.copyFileSync(file, latest);
  console.log('screenshot ->', file);
}

// Plain fixed-duration pause — for confirming something animates over time
// (e.g. diffing two screenshots taken N ms apart) where `scroll` as a delay
// hack would itself shift page content and contaminate the diff.
async function cmd_wait(ms) {
  await page.waitForTimeout(Number(ms) || 1000);
  console.log('waited', ms || 1000, 'ms');
}

// Generic text click, exact match, first hit — for one-off buttons that
// don't warrant a dedicated command (e.g. "Complete", "Post", "Completed").
async function cmd_click(...words) {
  const text = words.join(' ');
  await page.getByText(text, { exact: true }).first().click();
  await page.waitForTimeout(800);
  console.log('clicked:', text);
}

async function cmd_clickTestId(id) {
  await page.getByTestId(id).click();
  await page.waitForTimeout(800);
  console.log('clicked testid:', id);
}

// RN Pressable's onLongPress (default delayLongPress ~500ms) fires off a
// timer started on pointerdown/mousedown, not a distinct Playwright gesture
// — so a plain click with a held-down delay between mousedown and mouseup
// exercises the same code path a real long-press would.
async function cmd_longPressTestId(id, ms) {
  await page.getByTestId(id).click({ delay: Number(ms) || 700 });
  await page.waitForTimeout(800);
  console.log('long-pressed testid:', id);
}

async function cmd_fillTestId(id, ...words) {
  const text = words.join(' ');
  await page.getByTestId(id).fill(text);
  console.log('filled testid:', id, '->', text);
}

// Sets the hidden <input type="file"> expo-image-picker's web shim creates
// on launchCameraAsync/launchImageLibraryAsync (data-testid="file-input").
// NOT via getByTestId().setInputFiles() — headless Chromium auto-cancels a
// programmatically .click()'d file input almost immediately (confirmed:
// input.files stayed empty and the app's capturePhoto() resolved
// {status:'cancelled'} well within a 1.5s window), so by the time a second
// driver command could locate the element it was already gone. Must
// instead arm page.waitForEvent('filechooser') BEFORE the triggering
// click and race it against that click, matching Playwright's documented
// file-chooser-interception pattern.
async function cmd_upload(filePath, ...clickWords) {
  const clickText = clickWords.join(' ');
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 10000 }),
    page.getByText(clickText, { exact: true }).first().click(),
  ]);
  await chooser.setFiles(filePath);
  console.log('uploaded', filePath, 'via click:', clickText);
}

async function cmd_uploadTestId(filePath, testid) {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 10000 }),
    page.getByTestId(testid).click(),
  ]);
  await chooser.setFiles(filePath);
  console.log('uploaded', filePath, 'via testid:', testid);
}

async function cmd_countTestId(id) {
  const n = await page.getByTestId(id).count();
  console.log('count testid:', id, '->', n);
}

async function cmd_consoleErrors() {
  console.log('CONSOLE ERRORS:', JSON.stringify(consoleErrors, null, 2));
}

async function cmd_quit() {
  if (browser) await browser.close();
  console.log('closed');
}

const HANDLERS = {
  launch: cmd_launch,
  'seed-local': cmd_seedLocal,
  nav: cmd_nav,
  signup: cmd_signup,
  login: cmd_login,
  'dismiss-location-modal': cmd_dismissLocationModal,
  'click-tab': cmd_clickTab,
  'wait-for': cmd_waitFor,
  scroll: cmd_scroll,
  wait: cmd_wait,
  screenshot: cmd_screenshot,
  click: cmd_click,
  'click-testid': cmd_clickTestId,
  'long-press-testid': cmd_longPressTestId,
  'fill-testid': cmd_fillTestId,
  upload: cmd_upload,
  'upload-testid': cmd_uploadTestId,
  'count-testid': cmd_countTestId,
  'console-errors': cmd_consoleErrors,
  quit: cmd_quit,
};

// A heredoc hands stdin to this process all at once, so readline's 'line'
// event fires for every command back-to-back with no gap — an `async`
// listener on 'line' does NOT make readline wait for it, so without an
// explicit queue, `nav`/`signup`/etc. all start before `launch`'s
// `browser.newPage()` has resolved, racing against a still-null `page`.
// This queue forces strictly sequential execution, one command's promise
// fully settled before the next line is even dispatched.
const queue = [];
let draining = false;

async function drainQueue() {
  if (draining) return;
  draining = true;
  while (queue.length > 0) {
    const line = queue.shift();
    const [name, ...args] = line.split(' ');
    const handler = HANDLERS[name];
    if (!handler) {
      console.log('unknown command:', name);
      continue;
    }
    try {
      await handler(...args);
    } catch (err) {
      console.log(`ERROR in ${name}:`, err.message);
    }
  }
  draining = false;
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return;
  queue.push(trimmed);
  drainQueue();
});
// Deliberately no process.exit() anywhere in this file: it does not wait
// for buffered stdout to flush (documented Node behavior), and truncated
// mid-run here with only the last one or two log lines surviving. Once
// `quit` closes the browser (the only open handle) and stdin hits EOF,
// Node exits on its own — and only then, after stdout has actually drained.
