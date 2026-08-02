// Static catalog for the Rewards tab. Nothing here is redeemable yet —
// redemption ships alongside the Gumpa+ subscription once the underlying
// economics (subscription price, redemption caps, breakeven) are modeled.
// See AGENTS.md's "Product scope" section for the cost/scale posture this
// project takes before shipping anything that spends real money.

export type RewardBrandId = 'starbucks' | 'chipotle' | 'cava';

export interface RewardTier {
  amountUsd: number;
  coinCost: number;
}

export interface RewardBrand {
  id: RewardBrandId;
  name: string;
  logo: number;
  cardColor: string;
  blurb: string;
  tiers: RewardTier[];
}

// Provisional exchange rate — 100 coins = $1 of reward value. Chosen only to
// make the preview catalog feel achievable-but-aspirational against real
// quest earn rates; not a final number. The real rate has to be set
// alongside the Gumpa+ subscription price and a per-cycle redemption cap,
// since a power user's uncapped earn rate can otherwise exceed a plausible
// subscription price on its own.
export const COINS_PER_DOLLAR = 100;

function tier(amountUsd: number): RewardTier {
  return { amountUsd, coinCost: amountUsd * COINS_PER_DOLLAR };
}

export const REWARD_BRANDS: RewardBrand[] = [
  {
    id: 'starbucks',
    name: 'Starbucks',
    logo: require('../../assets/images/rewards/starbucks-logo.png'),
    cardColor: '#00704A',
    blurb: 'Coffee, cold brew, whatever gets you through the afternoon.',
    tiers: [tier(5), tier(10), tier(25)],
  },
  {
    id: 'chipotle',
    name: 'Chipotle',
    logo: require('../../assets/images/rewards/chipotle-logo.png'),
    cardColor: '#A81612',
    blurb: 'Burrito, bowl, extra guac, on the house.',
    tiers: [tier(5), tier(10), tier(25)],
  },
  {
    id: 'cava',
    name: 'CAVA',
    logo: require('../../assets/images/rewards/cava-logo.png'),
    cardColor: '#6E1423',
    blurb: 'Build your bowl, we cover part of the tab.',
    tiers: [tier(5), tier(10), tier(25)],
  },
];
