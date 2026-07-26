// Sidequest — challenge & shop catalog.
// Ported from the web app's js/data.js (kept in sync intentionally).

import type { CategoryId } from '@/constants/theme';

export type Cadence = 'daily' | 'weekly' | 'monthly';

// How a challenge's completion gets proven — every challenge is photo-verified
// by Claude via POST /verify, no honor-tap exists:
//  - 'photo': one photo, one completion.
//  - 'streak': N separate photo check-ins across the period (one per
//    calendar day), e.g. "3 workouts this week."
export type VerifyMethod = 'photo' | 'streak';

export interface Challenge {
  id: string;
  cadence: Cadence;
  cat: CategoryId;
  tokens: number;
  title: string;
  desc: string;
  verify: VerifyMethod;
  streakTarget?: number; // instances required within the period; only set when verify === 'streak'
  bgImage?: string; // city skyline/downtown photo — only set on server-generated local challenges
  isLocal?: boolean; // server-generated, tied to a real nearby place (see server/src/local-challenges.ts) — guaranteed a suggestion slot, see pickSuggestions in store.ts
}

export const CHALLENGES: Challenge[] = [
  // ---------- DAILY ----------
  { id: 'd-gym', cadence: 'daily', cat: 'fitness', tokens: 20, title: 'Go to the gym', desc: 'Get a real session in — 30 minutes minimum.', verify: 'photo' },
  { id: 'd-water', cadence: 'daily', cat: 'fitness', tokens: 15, title: 'Chug a gallon of water', desc: 'One gallon (3.8L) across the day. Photograph the empty jug.', verify: 'photo' },
  { id: 'd-steps', cadence: 'daily', cat: 'fitness', tokens: 15, title: 'Hit 10,000 steps', desc: 'Walk it out. Screenshot your step-counter app showing the total.', verify: 'photo' },
  { id: 'd-pushups', cadence: 'daily', cat: 'fitness', tokens: 10, title: 'Do 20 push-ups', desc: 'Split them up however you like. Knees are allowed.', verify: 'photo' },
  { id: 'd-stretch', cadence: 'daily', cat: 'fitness', tokens: 10, title: 'Stretch for 10 minutes', desc: 'Hips, hamstrings, shoulders. Future you says thanks.', verify: 'photo' },
  { id: 'd-logspend', cadence: 'daily', cat: 'finance', tokens: 10, title: 'Log every purchase today', desc: "Every coffee, every tap of the card. Screenshot your tracker at day's end.", verify: 'photo' },
  { id: 'd-nospend', cadence: 'daily', cat: 'finance', tokens: 20, title: 'Pack your own lunch', desc: 'Skip the takeout line — make something at home and bring it.', verify: 'photo' },
  { id: 'd-cook', cadence: 'daily', cat: 'finance', tokens: 15, title: 'Cook instead of ordering', desc: 'Make dinner at home tonight. Delivery apps stay closed.', verify: 'photo' },
  { id: 'd-balance', cadence: 'daily', cat: 'finance', tokens: 10, title: 'Check your balances', desc: 'Open every bank & card account. Screenshot the numbers. Breathe.', verify: 'photo' },
  { id: 'd-call', cadence: 'daily', cat: 'social', tokens: 15, title: 'Video call a friend or family member', desc: 'An actual face-to-face call, five minutes or more. Screenshot it mid-conversation.', verify: 'photo' },
  { id: 'd-compliment', cadence: 'daily', cat: 'social', tokens: 10, title: 'Leave an anonymous kind note for a stranger', desc: "Sticky note, gift receipt, whatever — leave it somewhere it'll be found. Photo it first.", verify: 'photo' },
  { id: 'd-reconnect', cadence: 'daily', cat: 'social', tokens: 15, title: 'Write a note to someone you lost touch with', desc: '"Hey, you crossed my mind today" — write it by hand, then send it however you like.', verify: 'photo' },
  { id: 'd-stranger', cadence: 'daily', cat: 'social', tokens: 20, title: 'Start a conversation with a stranger', desc: 'Barista, gym neighbor, dog owner. Low stakes, real reps. Snap a selfie right after.', verify: 'photo' },
  { id: 'd-scary', cadence: 'daily', cat: 'courage', tokens: 25, title: 'Do one thing that scares you', desc: "Small counts: the email, the ask, the sign-up. Snap a photo the moment it's done.", verify: 'photo' },
  { id: 'd-coldshower', cadence: 'daily', cat: 'courage', tokens: 15, title: '60-second cold shower', desc: 'End your shower cold, count to sixty, then photograph yourself right after.', verify: 'photo' },
  { id: 'd-speakup', cadence: 'daily', cat: 'courage', tokens: 15, title: 'Speak up once today', desc: 'In a meeting, a class, a group chat — say the thing, then snap a photo right after.', verify: 'photo' },
  { id: 'd-newstreet', cadence: 'daily', cat: 'explore', tokens: 15, title: "Walk a street you've never walked", desc: 'Take the unfamiliar turn on purpose.', verify: 'photo' },
  { id: 'd-newlunch', cadence: 'daily', cat: 'explore', tokens: 15, title: 'Eat somewhere new', desc: "A spot you've never tried, even if it's just a snack.", verify: 'photo' },
  { id: 'd-photo', cadence: 'daily', cat: 'explore', tokens: 10, title: 'Photograph something beautiful', desc: 'Slow down and actually notice your town.', verify: 'photo' },
  { id: 'd-read', cadence: 'daily', cat: 'mind', tokens: 15, title: 'Read 20 pages', desc: "A real book. Photograph today's page.", verify: 'photo' },
  { id: 'd-meditate', cadence: 'daily', cat: 'mind', tokens: 10, title: 'Meditate for 10 minutes', desc: 'Timer on, eyes closed, breathe. Photograph your space right after.', verify: 'photo' },
  { id: 'd-nosocial', cadence: 'daily', cat: 'mind', tokens: 20, title: 'No social media before noon', desc: "Protect your morning brain. Screenshot your phone's screen-time app showing none before noon.", verify: 'photo' },
  { id: 'd-language', cadence: 'daily', cat: 'mind', tokens: 10, title: 'Learn 5 words in a new language', desc: 'Any language, any app — screenshot the lesson you finished.', verify: 'photo' },
  { id: 'd-journal', cadence: 'daily', cat: 'mind', tokens: 10, title: 'Journal for 5 minutes', desc: "What happened, how you felt, what's next.", verify: 'photo' },

  // ---------- WEEKLY ----------
  { id: 'w-3workouts', cadence: 'weekly', cat: 'fitness', tokens: 60, title: 'Work out 3 times this week', desc: 'Gym, run, swim, class — any combination of three, each one photographed.', verify: 'streak', streakTarget: 3 },
  { id: 'w-newsport', cadence: 'weekly', cat: 'fitness', tokens: 50, title: 'Try a new sport or class', desc: 'Climbing, yoga, boxing, pickleball — beginner energy welcome.', verify: 'photo' },
  { id: 'w-15k', cadence: 'weekly', cat: 'fitness', tokens: 50, title: 'Cover 15km on foot', desc: "Running or walking, totaled across the week — screenshot your tracker's weekly total.", verify: 'photo' },
  { id: 'w-budget', cadence: 'weekly', cat: 'finance', tokens: 60, title: 'Set a weekly budget & stick to it', desc: 'Write the number Sunday, beat it by Saturday — screenshot the final numbers.', verify: 'photo' },
  { id: 'w-mealprep', cadence: 'weekly', cat: 'finance', tokens: 50, title: 'Meal prep for the week', desc: 'Cook once, eat five times. Photograph the containers.', verify: 'photo' },
  { id: 'w-subs', cadence: 'weekly', cat: 'finance', tokens: 40, title: 'Audit your subscriptions', desc: 'List them all, cancel at least one — screenshot the list or the cancellation.', verify: 'photo' },
  { id: 'w-savings', cadence: 'weekly', cat: 'finance', tokens: 50, title: 'Move money to savings', desc: "Any amount, automate it if you're feeling fancy — screenshot the transfer.", verify: 'photo' },
  { id: 'w-host', cadence: 'weekly', cat: 'social', tokens: 75, title: 'Text 3 people a real plan', desc: 'A specific day, time, and place — not just "we should hang out." Screenshot the text.', verify: 'photo' },
  { id: 'w-nophones', cadence: 'weekly', cat: 'social', tokens: 40, title: 'Share a phone-free meal', desc: 'One full meal with someone, devices face-down and away.', verify: 'photo' },
  { id: 'w-oldfriend', cadence: 'weekly', cat: 'social', tokens: 50, title: 'Write a real letter to an old friend', desc: 'Handwritten, no shortcuts — stamp it and photograph it before it goes in the mail.', verify: 'photo' },
  { id: 'w-askhang', cadence: 'weekly', cat: 'courage', tokens: 60, title: 'Invite someone new to hang out', desc: 'That coworker or acquaintance you always say "we should hang" to — screenshot the message you sent.', verify: 'photo' },
  { id: 'w-solo', cadence: 'weekly', cat: 'courage', tokens: 50, title: 'Do something solo', desc: 'Dinner, a movie, a museum — alone, on purpose. Photograph the moment.', verify: 'photo' },
  { id: 'w-negotiate', cadence: 'weekly', cat: 'courage', tokens: 60, title: 'Negotiate something', desc: 'Ask for a discount, question a bill, haggle at a market — photograph the receipt or confirmation showing the win.', verify: 'photo' },
  { id: 'w-newhood', cadence: 'weekly', cat: 'explore', tokens: 60, title: 'Explore a new neighborhood', desc: "Spend an hour somewhere in town you've never really been.", verify: 'photo' },
  { id: 'w-newcuisine', cadence: 'weekly', cat: 'explore', tokens: 50, title: "Try a cuisine you've never had", desc: 'Ethiopian? Georgian? Laotian? Go find out.', verify: 'photo' },
  { id: 'w-tourist', cadence: 'weekly', cat: 'explore', tokens: 75, title: 'Be a tourist in your own town', desc: 'One afternoon: landmarks, photos, overpriced snack, the works.', verify: 'photo' },
  { id: 'w-martini', cadence: 'weekly', cat: 'mind', tokens: 40, title: 'Learn to make an espresso martini', desc: 'Espresso, coffee liqueur, vodka, shake it like you mean it.', verify: 'photo' },
  { id: 'w-oldfashioned', cadence: 'weekly', cat: 'mind', tokens: 40, title: 'Create an Old Fashioned', desc: 'Bourbon, sugar, bitters, an orange peel. Stir, don\'t shake.', verify: 'photo' },
  { id: 'w-docu', cadence: 'weekly', cat: 'mind', tokens: 40, title: 'Watch a documentary & write a summary', desc: 'Watch one all the way through, then write a one-paragraph summary in your own words. Photograph it.', verify: 'photo' },
  { id: 'w-sunset', cadence: 'weekly', cat: 'mind', tokens: 60, title: 'Digital sunset, 5 nights', desc: 'Screens off an hour before bed — screenshot your screen-time app each of five nights.', verify: 'streak', streakTarget: 5 },
  { id: 'w-recipe', cadence: 'weekly', cat: 'mind', tokens: 40, title: 'Master a new recipe', desc: "Cook it well enough that you'd proudly serve it to a guest.", verify: 'photo' },

  // ---------- MONTHLY ----------
  { id: 'm-milestone', cadence: 'monthly', cat: 'fitness', tokens: 200, title: 'Hit a fitness milestone', desc: 'A 5k, a new PR, first pull-up — pick it, chase it, photograph it.', verify: 'photo' },
  { id: 'm-12gym', cadence: 'monthly', cat: 'fitness', tokens: 250, title: '12 workouts this month', desc: 'Three a week, each one photographed. Consistency is the whole game.', verify: 'streak', streakTarget: 12 },
  { id: 'm-budget', cadence: 'monthly', cat: 'finance', tokens: 150, title: 'Build your monthly budget', desc: 'Income, fixed costs, fun money, savings — screenshot it, on paper or in an app.', verify: 'photo' },
  { id: 'm-finbook', cadence: 'monthly', cat: 'finance', tokens: 200, title: 'Read a personal finance book', desc: 'One book, cover to cover. Then apply one idea.', verify: 'photo' },
  { id: 'm-emergency', cadence: 'monthly', cat: 'finance', tokens: 200, title: 'Grow your emergency fund', desc: 'Start it or boost it — screenshot the balance or the transfer.', verify: 'photo' },
  { id: 'm-event', cadence: 'monthly', cat: 'social', tokens: 250, title: 'Send invites for a 4+ person event', desc: "Pick the date, place, and guest list, then send it. Screenshot the invite.", verify: 'photo' },
  { id: 'm-volunteer', cadence: 'monthly', cat: 'social', tokens: 200, title: 'Volunteer locally', desc: 'A few hours for your community. Find what fits you.', verify: 'photo' },
  { id: 'm-newfriend', cadence: 'monthly', cat: 'social', tokens: 250, title: 'Send 3 hangout invites to acquaintances', desc: "People you like but haven't hung out with 1-on-1 yet. Sending it counts, whether or not they're free.", verify: 'streak', streakTarget: 3 },
  { id: 'm-putoff', cadence: 'monthly', cat: 'courage', tokens: 300, title: "Do the thing you've been putting off", desc: "You know the one — the appointment, the conversation, the start. Photograph it the moment it's done.", verify: 'photo' },
  { id: 'm-class', cadence: 'monthly', cat: 'courage', tokens: 250, title: 'Take an intimidating class', desc: 'Dance, improv, martial arts — whatever makes you nervous.', verify: 'photo' },
  { id: 'm-speech', cadence: 'monthly', cat: 'courage', tokens: 300, title: 'Speak in front of people', desc: 'A toast, an open mic, a presentation you volunteered for.', verify: 'photo' },
  { id: 'm-daytrip', cadence: 'monthly', cat: 'explore', tokens: 250, title: 'Take a day trip', desc: "Somewhere within two hours you've never been. Go.", verify: 'photo' },
  { id: 'm-landmark', cadence: 'monthly', cat: 'explore', tokens: 150, title: 'Visit a local landmark you\'ve skipped', desc: 'The museum or monument locals never actually visit.', verify: 'photo' },
  { id: 'm-sunrise', cadence: 'monthly', cat: 'explore', tokens: 150, title: 'Watch a sunrise from a new spot', desc: 'One early alarm, one great view, endless smugness.', verify: 'photo' },
  { id: 'm-2books', cadence: 'monthly', cat: 'mind', tokens: 200, title: 'Finish 2 books', desc: 'Any genre, audiobooks count if you actually listen — photograph the finished stack.', verify: 'photo' },
  { id: 'm-skill30', cadence: 'monthly', cat: 'mind', tokens: 250, title: '12-day skill streak', desc: '10 minutes a day on one skill — instrument, language, code, art. Photograph or screenshot each of 12 check-ins.', verify: 'streak', streakTarget: 12 },
];

CHALLENGES.forEach((c) => {
  if (c.verify === 'streak' && !c.streakTarget) throw new Error(`Challenge "${c.id}" is verify:'streak' but has no streakTarget`);
});
