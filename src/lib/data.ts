// Gumpa — challenge & shop catalog.
// Ported from the web app's js/data.js (kept in sync intentionally).

import type { CategoryId } from '@/constants/theme';

export type Cadence = 'daily' | 'weekly' | 'monthly';

// How a challenge's completion gets proven — every challenge is photo-verified
// by Claude via POST /verify, no honor-tap exists:
//  - 'photo': one photo, one completion.
//  - 'streak': N separate photo check-ins across the period (one per
//    calendar day), e.g. "3 workouts this week."
export type VerifyMethod = 'photo' | 'streak';

// What kind of image proves this challenge, and therefore which capture path
// the client offers:
//  - 'camera': a real-world moment — must come from the live in-app camera
//    (src/lib/photo.ts's capturePhoto), never the gallery, so an old or
//    internet-sourced photo can't be submitted.
//  - 'screenshot': proof of another app's UI (a step count, a screen-time
//    total, a transfer confirmation) — camera-only capture is impossible
//    here (you can't photograph your own screen with your own camera), so
//    these instead pick from the OS's own Screenshots album specifically
//    (src/lib/photo.ts's pickScreenshot), not the general camera roll.
//  - 'either': accepts both (e.g. a skill-practice streak that could be a
//    photo of the activity or a screenshot of a tracking app).
// Server-authoritative — mirrored in server/src/tokens.ts and never trusted
// from the client, same as tokens/verify/title/desc.
export type ProofType = 'camera' | 'screenshot' | 'either';

export interface Challenge {
  id: string;
  cadence: Cadence;
  cat: CategoryId;
  tokens: number;
  title: string;
  desc: string;
  verify: VerifyMethod;
  proofType: ProofType;
  streakTarget?: number; // instances required within the period; only set when verify === 'streak'
  bgImage?: string; // city skyline/downtown photo — only set on server-generated local challenges
  isLocal?: boolean; // server-generated, tied to a real nearby place (see server/src/local-challenges.ts) — guaranteed a suggestion slot, see pickSuggestions in store.ts
}

export const CHALLENGES: Challenge[] = [
  // ---------- DAILY ----------
  { id: 'd-water', cadence: 'daily', cat: 'fitness', tokens: 15, title: 'Chug a gallon of water', desc: 'One gallon (3.8L) across the day. Photograph the empty jug.', verify: 'photo', proofType: 'camera' },
  { id: 'd-steps', cadence: 'daily', cat: 'fitness', tokens: 15, title: 'Hit 10,000 steps', desc: 'Walk it out. Screenshot your step-counter app showing the total.', verify: 'photo', proofType: 'screenshot' },
  { id: 'd-pushups', cadence: 'daily', cat: 'fitness', tokens: 10, title: 'Do 20 push-ups', desc: 'Split them up however you like. Knees are allowed. Photograph yourself mid-set.', verify: 'photo', proofType: 'camera' },
  { id: 'd-logspend', cadence: 'daily', cat: 'finance', tokens: 10, title: 'Log every purchase today', desc: "Every coffee, every tap of the card. Screenshot your tracker at day's end.", verify: 'photo', proofType: 'screenshot' },
  { id: 'd-nospend', cadence: 'daily', cat: 'finance', tokens: 20, title: 'Pack your own lunch', desc: 'Skip the takeout line: make something at home and bring it. Photograph the lunch you packed.', verify: 'photo', proofType: 'camera' },
  { id: 'd-cook', cadence: 'daily', cat: 'finance', tokens: 15, title: 'Cook instead of ordering', desc: 'Make dinner at home tonight. Delivery apps stay closed. Photograph the finished meal.', verify: 'photo', proofType: 'camera' },
  { id: 'd-call', cadence: 'daily', cat: 'social', tokens: 15, title: 'Video call a friend or family member', desc: 'An actual face-to-face call, five minutes or more. Screenshot it mid-conversation.', verify: 'photo', proofType: 'screenshot' },
  { id: 'd-compliment', cadence: 'daily', cat: 'social', tokens: 10, title: 'Leave an anonymous kind note for a stranger', desc: "Sticky note, gift receipt, whatever. Leave it somewhere it'll be found. Photo it first.", verify: 'photo', proofType: 'camera' },
  { id: 'd-reconnect', cadence: 'daily', cat: 'social', tokens: 15, title: 'Write a note to someone you lost touch with', desc: '"Hey, you crossed my mind today." Write it by hand, then photograph it before you send it.', verify: 'photo', proofType: 'camera' },
  { id: 'd-coldshower', cadence: 'daily', cat: 'courage', tokens: 15, title: '60-second cold shower', desc: 'End your shower cold, count to sixty, then photograph yourself right after.', verify: 'photo', proofType: 'camera' },
  { id: 'd-newstreet', cadence: 'daily', cat: 'explore', tokens: 15, title: "Walk a street you've never walked", desc: 'Take the unfamiliar turn on purpose. Photograph the street sign or a landmark along it.', verify: 'photo', proofType: 'camera' },
  { id: 'd-newlunch', cadence: 'daily', cat: 'explore', tokens: 15, title: 'Eat somewhere new', desc: "Even if it's just a snack, photograph your food or the storefront.", verify: 'photo', proofType: 'camera' },
  { id: 'd-nosocial', cadence: 'daily', cat: 'mind', tokens: 20, title: 'No social media before noon', desc: "Protect your morning brain. Screenshot your phone's screen-time app showing none before noon.", verify: 'photo', proofType: 'screenshot' },
  { id: 'd-lunchspot', cadence: 'daily', cat: 'mind', tokens: 10, title: 'Eat lunch somewhere other than usual', desc: 'A different seat, room, or spot outside. Photograph your lunch there.', verify: 'photo', proofType: 'camera' },
  { id: 'd-newingredient', cadence: 'daily', cat: 'mind', tokens: 10, title: "Cook with an ingredient you've never used", desc: 'Something new in your kitchen tonight. Photograph the ingredient and the dish.', verify: 'photo', proofType: 'camera' },

  // ---------- WEEKLY ----------
  { id: 'w-newsport', cadence: 'weekly', cat: 'fitness', tokens: 50, title: 'Take a boxing class', desc: 'Find a local gym offering one. Photograph yourself there or your gloves/gear.', verify: 'photo', proofType: 'camera' },
  { id: 'w-15k', cadence: 'weekly', cat: 'fitness', tokens: 50, title: 'Cover 15km on foot', desc: "Running or walking, totaled across the week. Screenshot your tracker's weekly total.", verify: 'photo', proofType: 'screenshot' },
  { id: 'w-budget', cadence: 'weekly', cat: 'finance', tokens: 60, title: 'Set a weekly budget & stick to it', desc: 'Write the number Sunday, beat it by Saturday. Screenshot the final numbers.', verify: 'photo', proofType: 'screenshot' },
  { id: 'w-mealprep', cadence: 'weekly', cat: 'finance', tokens: 50, title: 'Meal prep for the week', desc: 'Cook once, eat five times. Photograph the containers.', verify: 'photo', proofType: 'camera' },
  { id: 'w-subs', cadence: 'weekly', cat: 'finance', tokens: 40, title: 'Audit your subscriptions', desc: 'List them all, cancel at least one. Screenshot the list or the cancellation.', verify: 'photo', proofType: 'screenshot' },
  { id: 'w-savings', cadence: 'weekly', cat: 'finance', tokens: 50, title: 'Move money to savings', desc: "Any amount, automate it if you're feeling fancy. Screenshot the transfer.", verify: 'photo', proofType: 'screenshot' },
  { id: 'w-nophones', cadence: 'weekly', cat: 'social', tokens: 40, title: 'Share a phone-free meal', desc: 'One full meal with someone, devices face-down. Photograph the table with both phones face-down next to your plates.', verify: 'photo', proofType: 'camera' },
  { id: 'w-oldfriend', cadence: 'weekly', cat: 'social', tokens: 50, title: 'Write a real letter to an old friend', desc: 'Handwritten, no shortcuts. Stamp it and photograph it before it goes in the mail.', verify: 'photo', proofType: 'camera' },
  { id: 'w-solo', cadence: 'weekly', cat: 'courage', tokens: 50, title: 'See a movie alone at the theater', desc: 'No company, on purpose. Photograph your ticket stub.', verify: 'photo', proofType: 'camera' },
  { id: 'w-negotiate', cadence: 'weekly', cat: 'courage', tokens: 60, title: 'Ask for a discount at checkout', desc: 'Any store, any reason. Photograph the receipt or confirmation showing the win.', verify: 'photo', proofType: 'camera' },
  { id: 'w-newhood', cadence: 'weekly', cat: 'explore', tokens: 60, title: 'Find a mural or street art piece nearby', desc: 'Somewhere in town you\'ve never noticed it. Photograph it.', verify: 'photo', proofType: 'camera' },
  { id: 'w-newcuisine', cadence: 'weekly', cat: 'explore', tokens: 50, title: 'Try an Ethiopian restaurant', desc: "Order something you can't pronounce. Photograph your dish or the menu.", verify: 'photo', proofType: 'camera' },
  { id: 'w-tourist', cadence: 'weekly', cat: 'explore', tokens: 75, title: "Visit a museum or park you haven't been to", desc: 'One you keep meaning to check out. Photograph yourself there or your ticket.', verify: 'photo', proofType: 'camera' },
  { id: 'w-martini', cadence: 'weekly', cat: 'mind', tokens: 40, title: 'Learn to make an espresso martini', desc: 'Espresso, coffee liqueur, vodka. Shake it like you mean it. Photograph the finished drink.', verify: 'photo', proofType: 'camera' },
  { id: 'w-oldfashioned', cadence: 'weekly', cat: 'mind', tokens: 40, title: 'Create an Old Fashioned', desc: "Bourbon, sugar, bitters, an orange peel. Stir, don't shake. Photograph the finished drink.", verify: 'photo', proofType: 'camera' },
  { id: 'w-sunset', cadence: 'weekly', cat: 'mind', tokens: 60, title: 'Digital sunset, 5 nights', desc: 'Screens off an hour before bed. Screenshot your screen-time app each of five nights.', verify: 'streak', streakTarget: 5, proofType: 'screenshot' },
  { id: 'w-recipe', cadence: 'weekly', cat: 'mind', tokens: 40, title: 'Cook a risotto from scratch', desc: 'Stir it slow, get it creamy. Photograph the finished dish.', verify: 'photo', proofType: 'camera' },

  // ---------- MONTHLY ----------
  { id: 'm-milestone', cadence: 'monthly', cat: 'fitness', tokens: 200, title: 'Run a 5K', desc: 'Register for one or just time yourself. Photograph your finish, bib, or time.', verify: 'photo', proofType: 'camera' },
  { id: 'm-emergency', cadence: 'monthly', cat: 'finance', tokens: 200, title: 'Grow your emergency fund', desc: 'Start it or boost it. Screenshot the balance or the transfer.', verify: 'photo', proofType: 'screenshot' },
  { id: 'm-volunteer', cadence: 'monthly', cat: 'social', tokens: 200, title: 'Volunteer locally', desc: 'A few hours for your community. Photograph your sign-in sheet, name badge, or the work itself as proof.', verify: 'photo', proofType: 'camera' },
  { id: 'm-class', cadence: 'monthly', cat: 'courage', tokens: 250, title: 'Take an improv comedy class', desc: 'One session, no experience needed. Photograph yourself there.', verify: 'photo', proofType: 'camera' },
  { id: 'm-speech', cadence: 'monthly', cat: 'courage', tokens: 300, title: 'Perform at an open mic', desc: 'Comedy, poetry, music. Sign up and go. Snap a photo right after.', verify: 'photo', proofType: 'camera' },
  { id: 'm-daytrip', cadence: 'monthly', cat: 'explore', tokens: 250, title: 'Take a day trip', desc: "Somewhere within two hours. Photograph yourself or the view once you get there.", verify: 'photo', proofType: 'camera' },
  { id: 'm-sunrise', cadence: 'monthly', cat: 'explore', tokens: 150, title: 'Watch the sunrise from a rooftop or hilltop', desc: 'One early alarm, one great view from up high. Photograph the sunrise itself.', verify: 'photo', proofType: 'camera' },
  { id: 'm-skill30', cadence: 'monthly', cat: 'mind', tokens: 250, title: '12-day skill streak', desc: '10 minutes a day on one skill: instrument, language, code, art. Photograph or screenshot each of 12 check-ins.', verify: 'streak', streakTarget: 12, proofType: 'either' },
];

// Catches the exact class of bug that shipped repeatedly here: a challenge
// marked verify:'photo'/'streak' whose title+desc never actually says what
// to photograph (see docs/challenge-writing-guide.md's "no zero-cost fake
// path" rule) — 20+ entries had this before an actual audit caught it, and
// nothing had been checking for it automatically. Doesn't (and can't) check
// that the described photo target is a good one, only that one is named.
CHALLENGES.forEach((c) => {
  if (c.verify === 'streak' && !c.streakTarget) throw new Error(`Challenge "${c.id}" is verify:'streak' but has no streakTarget`);
  const text = `${c.title} ${c.desc}`.toLowerCase();
  if (!text.includes('photo') && !text.includes('screenshot')) {
    throw new Error(`Challenge "${c.id}" doesn't name a photo/screenshot target in its title or desc`);
  }
  if ((c.proofType === 'screenshot' || c.proofType === 'either') && !text.includes('screenshot')) {
    throw new Error(`Challenge "${c.id}" is proofType '${c.proofType}' but never says "screenshot" in its title or desc`);
  }
  if (c.proofType === 'camera' && !text.includes('photo')) {
    throw new Error(`Challenge "${c.id}" is proofType 'camera' but never says "photo"/"photograph" in its title or desc`);
  }
});
