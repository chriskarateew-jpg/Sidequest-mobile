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

export interface CatalogEntry {
  cadence: Cadence;
  tokens: number;
  verify: VerifyType;
  target?: number; // instances required within the period; only set when verify === 'streak'
  title: string;
  desc: string;
}

export const CHALLENGE_CATALOG: Record<string, CatalogEntry> = {
  'd-gym': { cadence: 'daily', tokens: 20, verify: 'photo', title: 'Go to the gym', desc: 'Get a real session in — 30 minutes minimum.' },
  'd-water': { cadence: 'daily', tokens: 15, verify: 'photo', title: 'Chug a gallon of water', desc: 'One gallon (3.8L) across the day. Photograph the empty jug.' },
  'd-steps': { cadence: 'daily', tokens: 15, verify: 'photo', title: 'Hit 10,000 steps', desc: 'Walk it out. Screenshot your step-counter app showing the total.' },
  'd-pushups': { cadence: 'daily', tokens: 10, verify: 'photo', title: 'Do 20 push-ups', desc: 'Split them up however you like. Knees are allowed.' },
  'd-stretch': { cadence: 'daily', tokens: 10, verify: 'photo', title: 'Stretch for 10 minutes', desc: 'Hips, hamstrings, shoulders. Future you says thanks.' },
  'd-logspend': { cadence: 'daily', tokens: 10, verify: 'photo', title: 'Log every purchase today', desc: "Every coffee, every tap of the card. Screenshot your tracker at day's end." },
  'd-nospend': { cadence: 'daily', tokens: 20, verify: 'photo', title: 'Pack your own lunch', desc: 'Skip the takeout line — make something at home and bring it.' },
  'd-cook': { cadence: 'daily', tokens: 15, verify: 'photo', title: 'Cook instead of ordering', desc: 'Make dinner at home tonight. Delivery apps stay closed.' },
  'd-balance': { cadence: 'daily', tokens: 10, verify: 'photo', title: 'Check your balances', desc: 'Open every bank & card account. Screenshot the numbers. Breathe.' },
  'd-call': { cadence: 'daily', tokens: 15, verify: 'photo', title: 'Video call a friend or family member', desc: 'An actual face-to-face call, five minutes or more. Screenshot it mid-conversation.' },
  'd-compliment': { cadence: 'daily', tokens: 10, verify: 'photo', title: 'Leave an anonymous kind note for a stranger', desc: "Sticky note, gift receipt, whatever — leave it somewhere it'll be found. Photo it first." },
  'd-reconnect': { cadence: 'daily', tokens: 15, verify: 'photo', title: 'Write a note to someone you lost touch with', desc: '"Hey, you crossed my mind today" — write it by hand, then send it however you like.' },
  'd-stranger': { cadence: 'daily', tokens: 20, verify: 'photo', title: 'Start a conversation with a stranger', desc: 'Barista, gym neighbor, dog owner. Low stakes, real reps. Snap a selfie right after.' },
  'd-scary': { cadence: 'daily', tokens: 25, verify: 'photo', title: 'Do one thing that scares you', desc: 'Small counts: the email, the ask, the sign-up. Snap a photo the moment it\'s done.' },
  'd-coldshower': { cadence: 'daily', tokens: 15, verify: 'photo', title: '60-second cold shower', desc: 'End your shower cold, count to sixty, then photograph yourself right after.' },
  'd-speakup': { cadence: 'daily', tokens: 15, verify: 'photo', title: 'Speak up once today', desc: 'In a meeting, a class, a group chat — say the thing, then snap a photo right after.' },
  'd-newstreet': { cadence: 'daily', tokens: 15, verify: 'photo', title: "Walk a street you've never walked", desc: 'Take the unfamiliar turn on purpose.' },
  'd-newlunch': { cadence: 'daily', tokens: 15, verify: 'photo', title: 'Eat somewhere new', desc: "A spot you've never tried, even if it's just a snack." },
  'd-photo': { cadence: 'daily', tokens: 10, verify: 'photo', title: 'Photograph something beautiful', desc: 'Slow down and actually notice your town.' },
  'd-read': { cadence: 'daily', tokens: 15, verify: 'photo', title: 'Read 20 pages', desc: "A real book. Photograph today's page." },
  'd-meditate': { cadence: 'daily', tokens: 10, verify: 'photo', title: 'Meditate for 10 minutes', desc: 'Timer on, eyes closed, breathe. Photograph your space right after.' },
  'd-nosocial': { cadence: 'daily', tokens: 20, verify: 'photo', title: 'No social media before noon', desc: "Protect your morning brain. Screenshot your phone's screen-time app showing none before noon." },
  'd-language': { cadence: 'daily', tokens: 10, verify: 'photo', title: 'Learn 5 words in a new language', desc: 'Any language, any app — screenshot the lesson you finished.' },
  'd-journal': { cadence: 'daily', tokens: 10, verify: 'photo', title: 'Journal for 5 minutes', desc: "What happened, how you felt, what's next." },
  'w-3workouts': { cadence: 'weekly', tokens: 60, verify: 'streak', target: 3, title: 'Work out 3 times this week', desc: 'Gym, run, swim, class — any combination of three, each one photographed.' },
  'w-newsport': { cadence: 'weekly', tokens: 50, verify: 'photo', title: 'Try a new sport or class', desc: 'Climbing, yoga, boxing, pickleball — beginner energy welcome.' },
  'w-15k': { cadence: 'weekly', tokens: 50, verify: 'photo', title: 'Cover 15km on foot', desc: "Running or walking, totaled across the week — screenshot your tracker's weekly total." },
  'w-budget': { cadence: 'weekly', tokens: 60, verify: 'photo', title: 'Set a weekly budget & stick to it', desc: 'Write the number Sunday, beat it by Saturday — screenshot the final numbers.' },
  'w-mealprep': { cadence: 'weekly', tokens: 50, verify: 'photo', title: 'Meal prep for the week', desc: 'Cook once, eat five times. Photograph the containers.' },
  'w-subs': { cadence: 'weekly', tokens: 40, verify: 'photo', title: 'Audit your subscriptions', desc: 'List them all, cancel at least one — screenshot the list or the cancellation.' },
  'w-savings': { cadence: 'weekly', tokens: 50, verify: 'photo', title: 'Move money to savings', desc: "Any amount, automate it if you're feeling fancy — screenshot the transfer." },
  'w-host': { cadence: 'weekly', tokens: 75, verify: 'photo', title: 'Text 3 people a real plan', desc: 'A specific day, time, and place — not just "we should hang out." Screenshot the text.' },
  'w-nophones': { cadence: 'weekly', tokens: 40, verify: 'photo', title: 'Share a phone-free meal', desc: 'One full meal with someone, devices face-down and away.' },
  'w-oldfriend': { cadence: 'weekly', tokens: 50, verify: 'photo', title: 'Write a real letter to an old friend', desc: 'Handwritten, no shortcuts — stamp it and photograph it before it goes in the mail.' },
  'w-askhang': { cadence: 'weekly', tokens: 60, verify: 'photo', title: 'Invite someone new to hang out', desc: 'That coworker or acquaintance you always say "we should hang" to — screenshot the message you sent.' },
  'w-solo': { cadence: 'weekly', tokens: 50, verify: 'photo', title: 'Do something solo', desc: 'Dinner, a movie, a museum — alone, on purpose. Photograph the moment.' },
  'w-negotiate': { cadence: 'weekly', tokens: 60, verify: 'photo', title: 'Negotiate something', desc: 'Ask for a discount, question a bill, haggle at a market — photograph the receipt or confirmation showing the win.' },
  'w-newhood': { cadence: 'weekly', tokens: 60, verify: 'photo', title: 'Explore a new neighborhood', desc: "Spend an hour somewhere in town you've never really been." },
  'w-newcuisine': { cadence: 'weekly', tokens: 50, verify: 'photo', title: "Try a cuisine you've never had", desc: 'Ethiopian? Georgian? Laotian? Go find out.' },
  'w-tourist': { cadence: 'weekly', tokens: 75, verify: 'photo', title: 'Be a tourist in your own town', desc: 'One afternoon: landmarks, photos, overpriced snack, the works.' },
  'w-martini': { cadence: 'weekly', tokens: 40, verify: 'photo', title: 'Learn to make an espresso martini', desc: 'Espresso, coffee liqueur, vodka, shake it like you mean it.' },
  'w-oldfashioned': { cadence: 'weekly', tokens: 40, verify: 'photo', title: 'Create an Old Fashioned', desc: 'Bourbon, sugar, bitters, an orange peel. Stir, don\'t shake.' },
  'w-docu': { cadence: 'weekly', tokens: 40, verify: 'photo', title: 'Watch a documentary & write a summary', desc: 'Watch one all the way through, then write a one-paragraph summary in your own words. Photograph it.' },
  'w-sunset': { cadence: 'weekly', tokens: 60, verify: 'streak', target: 5, title: 'Digital sunset, 5 nights', desc: 'Screens off an hour before bed — screenshot your screen-time app each of five nights.' },
  'w-recipe': { cadence: 'weekly', tokens: 40, verify: 'photo', title: 'Master a new recipe', desc: "Cook it well enough that you'd proudly serve it to a guest." },
  'm-milestone': { cadence: 'monthly', tokens: 200, verify: 'photo', title: 'Hit a fitness milestone', desc: 'A 5k, a new PR, first pull-up — pick it, chase it, photograph it.' },
  'm-12gym': { cadence: 'monthly', tokens: 250, verify: 'streak', target: 12, title: '12 workouts this month', desc: 'Three a week, each one photographed. Consistency is the whole game.' },
  'm-budget': { cadence: 'monthly', tokens: 150, verify: 'photo', title: 'Build your monthly budget', desc: 'Income, fixed costs, fun money, savings — screenshot it, on paper or in an app.' },
  'm-finbook': { cadence: 'monthly', tokens: 200, verify: 'photo', title: 'Read a personal finance book', desc: 'One book, cover to cover. Then apply one idea.' },
  'm-emergency': { cadence: 'monthly', tokens: 200, verify: 'photo', title: 'Grow your emergency fund', desc: 'Start it or boost it — screenshot the balance or the transfer.' },
  'm-event': { cadence: 'monthly', tokens: 250, verify: 'photo', title: 'Send invites for a 4+ person event', desc: "Pick the date, place, and guest list, then send it. Screenshot the invite." },
  'm-volunteer': { cadence: 'monthly', tokens: 200, verify: 'photo', title: 'Volunteer locally', desc: 'A few hours for your community. Find what fits you.' },
  'm-newfriend': { cadence: 'monthly', tokens: 250, verify: 'streak', target: 3, title: 'Send 3 hangout invites to acquaintances', desc: "People you like but haven't hung out with 1-on-1 yet. Sending it counts, whether or not they're free." },
  'm-putoff': { cadence: 'monthly', tokens: 300, verify: 'photo', title: "Do the thing you've been putting off", desc: "You know the one — the appointment, the conversation, the start. Photograph it the moment it's done." },
  'm-class': { cadence: 'monthly', tokens: 250, verify: 'photo', title: 'Take an intimidating class', desc: 'Dance, improv, martial arts — whatever makes you nervous.' },
  'm-speech': { cadence: 'monthly', tokens: 300, verify: 'photo', title: 'Speak in front of people', desc: 'A toast, an open mic, a presentation you volunteered for.' },
  'm-daytrip': { cadence: 'monthly', tokens: 250, verify: 'photo', title: 'Take a day trip', desc: "Somewhere within two hours you've never been. Go." },
  'm-landmark': { cadence: 'monthly', tokens: 150, verify: 'photo', title: "Visit a local landmark you've skipped", desc: 'The museum or monument locals never actually visit.' },
  'm-sunrise': { cadence: 'monthly', tokens: 150, verify: 'photo', title: 'Watch a sunrise from a new spot', desc: 'One early alarm, one great view, endless smugness.' },
  'm-2books': { cadence: 'monthly', tokens: 200, verify: 'photo', title: 'Finish 2 books', desc: 'Any genre, audiobooks count if you actually listen — photograph the finished stack.' },
  'm-skill30': { cadence: 'monthly', tokens: 250, verify: 'streak', target: 12, title: '12-day skill streak', desc: '10 minutes a day on one skill — instrument, language, code, art. Photograph or screenshot each of 12 check-ins.' },
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

export async function handleGetBalance(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (!auth) return error('Not authenticated', 401);

  const row = await env.DB.prepare('SELECT tokens FROM users WHERE id = ?').bind(auth.id).first<{ tokens: number }>();
  return json({ tokens: row?.tokens ?? 0 });
}
