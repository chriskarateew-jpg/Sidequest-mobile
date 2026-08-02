import { requireAuth } from './auth';
import type { Env } from './env';
import { error, json } from './http';

// Server-side mirror of the client's static catalog (src/lib/data.ts).
// Token amounts, cadence, verify method/target, and post title/desc are all
// authoritative here and never trusted from the client — every earn/spend/
// duel/completion is validated against this map so nothing can be forged
// client-side. Keep in sync with src/lib/data.ts if that catalog changes.
export type Cadence = 'daily' | 'weekly' | 'monthly';
export type VerifyType = 'photo' | 'streak';
// Mirrors src/lib/data.ts's ProofType — see that file for what each value
// means and why. Authoritative here; the client's declared proofType is
// never trusted for gating (e.g. the GPS-mismatch check in complete.ts).
export type ProofType = 'camera' | 'screenshot' | 'either';

export interface CatalogEntry {
  cadence: Cadence;
  tokens: number;
  verify: VerifyType;
  proofType: ProofType;
  target?: number; // instances required within the period; only set when verify === 'streak'
  title: string;
  desc: string;
  placeLat?: number; // only set for server-generated local/venue challenges
  placeLng?: number;
  placeName?: string;
}

export const CHALLENGE_CATALOG: Record<string, CatalogEntry> = {
  'd-water': { cadence: 'daily', tokens: 15, verify: 'photo', proofType: 'camera', title: 'Chug a gallon of water', desc: 'One gallon (3.8L) across the day. Photograph the empty jug.' },
  'd-steps': { cadence: 'daily', tokens: 15, verify: 'photo', proofType: 'screenshot', title: 'Hit 10,000 steps', desc: 'Walk it out. Screenshot your step-counter app showing the total.' },
  'd-pushups': { cadence: 'daily', tokens: 10, verify: 'photo', proofType: 'camera', title: 'Do 20 push-ups', desc: 'Split them up however you like. Knees are allowed. Photograph yourself mid-set.' },
  'd-logspend': { cadence: 'daily', tokens: 10, verify: 'photo', proofType: 'screenshot', title: 'Log every purchase today', desc: "Every coffee, every tap of the card. Screenshot your tracker at day's end." },
  'd-nospend': { cadence: 'daily', tokens: 20, verify: 'photo', proofType: 'camera', title: 'Pack your own lunch', desc: 'Skip the takeout line — make something at home and bring it. Photograph the lunch you packed.' },
  'd-cook': { cadence: 'daily', tokens: 15, verify: 'photo', proofType: 'camera', title: 'Cook instead of ordering', desc: 'Make dinner at home tonight. Delivery apps stay closed. Photograph the finished meal.' },
  'd-call': { cadence: 'daily', tokens: 15, verify: 'photo', proofType: 'screenshot', title: 'Video call a friend or family member', desc: 'An actual face-to-face call, five minutes or more. Screenshot it mid-conversation.' },
  'd-compliment': { cadence: 'daily', tokens: 10, verify: 'photo', proofType: 'camera', title: 'Leave an anonymous kind note for a stranger', desc: "Sticky note, gift receipt, whatever — leave it somewhere it'll be found. Photo it first." },
  'd-reconnect': { cadence: 'daily', tokens: 15, verify: 'photo', proofType: 'camera', title: 'Write a note to someone you lost touch with', desc: '"Hey, you crossed my mind today" — write it by hand, then photograph it before you send it.' },
  'd-coldshower': { cadence: 'daily', tokens: 15, verify: 'photo', proofType: 'camera', title: '60-second cold shower', desc: 'End your shower cold, count to sixty, then photograph yourself right after.' },
  'd-newstreet': { cadence: 'daily', tokens: 15, verify: 'photo', proofType: 'camera', title: "Walk a street you've never walked", desc: 'Take the unfamiliar turn on purpose — photograph the street sign or a landmark along it.' },
  'd-newlunch': { cadence: 'daily', tokens: 15, verify: 'photo', proofType: 'camera', title: 'Eat somewhere new', desc: "Even if it's just a snack — photograph your food or the storefront." },
  'd-nosocial': { cadence: 'daily', tokens: 20, verify: 'photo', proofType: 'screenshot', title: 'No social media before noon', desc: "Protect your morning brain. Screenshot your phone's screen-time app showing none before noon." },
  'd-lunchspot': { cadence: 'daily', tokens: 10, verify: 'photo', proofType: 'camera', title: 'Eat lunch somewhere other than usual', desc: 'A different seat, room, or spot outside — photograph your lunch there.' },
  'd-newingredient': { cadence: 'daily', tokens: 10, verify: 'photo', proofType: 'camera', title: "Cook with an ingredient you've never used", desc: 'Something new in your kitchen tonight — photograph the ingredient and the dish.' },
  'w-newsport': { cadence: 'weekly', tokens: 50, verify: 'photo', proofType: 'camera', title: 'Take a boxing class', desc: 'Find a local gym offering one — photograph yourself there or your gloves/gear.' },
  'w-15k': { cadence: 'weekly', tokens: 50, verify: 'photo', proofType: 'screenshot', title: 'Cover 15km on foot', desc: "Running or walking, totaled across the week — screenshot your tracker's weekly total." },
  'w-budget': { cadence: 'weekly', tokens: 60, verify: 'photo', proofType: 'screenshot', title: 'Set a weekly budget & stick to it', desc: 'Write the number Sunday, beat it by Saturday — screenshot the final numbers.' },
  'w-mealprep': { cadence: 'weekly', tokens: 50, verify: 'photo', proofType: 'camera', title: 'Meal prep for the week', desc: 'Cook once, eat five times. Photograph the containers.' },
  'w-subs': { cadence: 'weekly', tokens: 40, verify: 'photo', proofType: 'screenshot', title: 'Audit your subscriptions', desc: 'List them all, cancel at least one — screenshot the list or the cancellation.' },
  'w-savings': { cadence: 'weekly', tokens: 50, verify: 'photo', proofType: 'screenshot', title: 'Move money to savings', desc: "Any amount, automate it if you're feeling fancy — screenshot the transfer." },
  'w-nophones': { cadence: 'weekly', tokens: 40, verify: 'photo', proofType: 'camera', title: 'Share a phone-free meal', desc: 'One full meal with someone, devices face-down. Photograph the table with both phones face-down next to your plates.' },
  'w-oldfriend': { cadence: 'weekly', tokens: 50, verify: 'photo', proofType: 'camera', title: 'Write a real letter to an old friend', desc: 'Handwritten, no shortcuts — stamp it and photograph it before it goes in the mail.' },
  'w-solo': { cadence: 'weekly', tokens: 50, verify: 'photo', proofType: 'camera', title: 'See a movie alone at the theater', desc: 'No company, on purpose — photograph your ticket stub.' },
  'w-negotiate': { cadence: 'weekly', tokens: 60, verify: 'photo', proofType: 'camera', title: 'Ask for a discount at checkout', desc: 'Any store, any reason — photograph the receipt or confirmation showing the win.' },
  'w-newhood': { cadence: 'weekly', tokens: 60, verify: 'photo', proofType: 'camera', title: 'Find a mural or street art piece nearby', desc: "Somewhere in town you've never noticed it — photograph it." },
  'w-newcuisine': { cadence: 'weekly', tokens: 50, verify: 'photo', proofType: 'camera', title: 'Try an Ethiopian restaurant', desc: "Order something you can't pronounce — photograph your dish or the menu." },
  'w-tourist': { cadence: 'weekly', tokens: 75, verify: 'photo', proofType: 'camera', title: "Visit a museum or park you haven't been to", desc: 'One you keep meaning to check out — photograph yourself there or your ticket.' },
  'w-martini': { cadence: 'weekly', tokens: 40, verify: 'photo', proofType: 'camera', title: 'Learn to make an espresso martini', desc: 'Espresso, coffee liqueur, vodka — shake it like you mean it. Photograph the finished drink.' },
  'w-oldfashioned': { cadence: 'weekly', tokens: 40, verify: 'photo', proofType: 'camera', title: 'Create an Old Fashioned', desc: "Bourbon, sugar, bitters, an orange peel. Stir, don't shake — photograph the finished drink." },
  'w-sunset': { cadence: 'weekly', tokens: 60, verify: 'streak', target: 5, proofType: 'screenshot', title: 'Digital sunset, 5 nights', desc: 'Screens off an hour before bed — screenshot your screen-time app each of five nights.' },
  'w-recipe': { cadence: 'weekly', tokens: 40, verify: 'photo', proofType: 'camera', title: 'Cook a risotto from scratch', desc: 'Stir it slow, get it creamy — photograph the finished dish.' },
  'm-milestone': { cadence: 'monthly', tokens: 200, verify: 'photo', proofType: 'camera', title: 'Run a 5K', desc: 'Register for one or just time yourself — photograph your finish, bib, or time.' },
  'm-emergency': { cadence: 'monthly', tokens: 200, verify: 'photo', proofType: 'screenshot', title: 'Grow your emergency fund', desc: 'Start it or boost it — screenshot the balance or the transfer.' },
  'm-volunteer': { cadence: 'monthly', tokens: 200, verify: 'photo', proofType: 'camera', title: 'Volunteer locally', desc: 'A few hours for your community. Photograph your sign-in sheet, name badge, or the work itself as proof.' },
  'm-class': { cadence: 'monthly', tokens: 250, verify: 'photo', proofType: 'camera', title: 'Take an improv comedy class', desc: 'One session, no experience needed — photograph yourself there.' },
  'm-speech': { cadence: 'monthly', tokens: 300, verify: 'photo', proofType: 'camera', title: 'Perform at an open mic', desc: 'Comedy, poetry, music — sign up and go. Snap a photo right after.' },
  'm-daytrip': { cadence: 'monthly', tokens: 250, verify: 'photo', proofType: 'camera', title: 'Take a day trip', desc: "Somewhere within two hours — photograph yourself or the view once you get there." },
  'm-sunrise': { cadence: 'monthly', tokens: 150, verify: 'photo', proofType: 'camera', title: 'Watch the sunrise from a rooftop or hilltop', desc: 'One early alarm, one great view from up high — photograph the sunrise itself.' },
  'm-skill30': { cadence: 'monthly', tokens: 250, verify: 'streak', target: 12, proofType: 'either', title: '12-day skill streak', desc: '10 minutes a day on one skill — instrument, language, code, art. Photograph or screenshot each of 12 check-ins.' },
};

// 'shop_purchase' is kept here even though the shop is gone — old
// token_ledger rows still carry it and this type must stay able to describe them.
export type LedgerReason =
  | 'quest_complete'
  | 'shop_purchase'
  | 'pot_stake'
  | 'pot_payout'
  | 'pot_refund'
  | 'duel_stake'
  | 'duel_payout'
  | 'duel_refund';

// Credits always succeed. Returns the new balance.
export async function creditTokens(env: Env, userId: string, amount: number, reason: LedgerReason, refId?: string): Promise<number> {
  await env.DB.batch([
    env.DB.prepare('INSERT INTO token_ledger (id, user_id, amount, reason, ref_id, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), userId, amount, reason, refId ?? null, Date.now()),
    env.DB.prepare('UPDATE users SET tokens = tokens + ? WHERE id = ?').bind(amount, userId),
  ]);
  const row = await env.DB.prepare('SELECT tokens FROM users WHERE id = ?').bind(userId).first<{ tokens: number }>();
  return row?.tokens ?? 0;
}

// Debits are conditional on having enough balance — the UPDATE itself enforces
// that atomically (no separate read-then-write race), returning false if it
// didn't have enough to cover the debit.
export async function debitTokens(env: Env, userId: string, amount: number, reason: LedgerReason, refId?: string): Promise<boolean> {
  const result = await env.DB.prepare('UPDATE users SET tokens = tokens - ? WHERE id = ? AND tokens >= ?')
    .bind(amount, userId, amount)
    .run();
  if (result.meta.changes === 0) return false;

  await env.DB.prepare('INSERT INTO token_ledger (id, user_id, amount, reason, ref_id, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), userId, -amount, reason, refId ?? null, Date.now())
    .run();
  return true;
}

export async function getTokenBalance(env: Env, userId: string): Promise<number> {
  const row = await env.DB.prepare('SELECT tokens FROM users WHERE id = ?').bind(userId).first<{ tokens: number }>();
  return row?.tokens ?? 0;
}

export async function handleGetBalance(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (!auth) return error('Not authenticated', 401);

  const tokens = await getTokenBalance(env, auth.id);
  return json({ tokens });
}
