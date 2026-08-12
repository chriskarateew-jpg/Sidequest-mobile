// Gumpa — the shared "coin" visual: a gold-gradient circular badge behind
// CoinIcon, paired with the token amount. Pulled out of profile.tsx,
// rewards.tsx, challenge-card.tsx, submission-result-modal.tsx, and
// completed.tsx (which was still using a bare 🪙 emoji, a direct AGENTS.md
// violation — see rail-icons.tsx's header comment) so every place tokens
// show up in the app renders the same distinct, "this is a real coin, not
// just a number" mark instead of five slightly different flat gold pills.
//
// Deliberately doesn't own an outer pill/background — each screen already
// has its own container shape around this (a horizontal balance pill, a
// vertical profile stat, a big celebratory reward row, a small inline card
// tag), and forcing one shared container would fight those instead of
// fitting them.

import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import { CoinIcon } from '@/components/rail-icons';
import { Colors } from '@/constants/theme';

const SIZES = {
  sm: { coin: 20, icon: 12, font: 13, gap: 5 },
  md: { coin: 26, icon: 15, font: 15.5, gap: 7 },
  lg: { coin: 36, icon: 21, font: 22, gap: 9 },
} as const;

export type TokenBadgeSize = keyof typeof SIZES;

export function TokenBadge({
  value,
  size = 'md',
  strikeValue,
}: {
  // Pre-formatted by the caller ("+75", "1,240", "500") since the right
  // format (a signed delta, a bare balance, a comma-grouped total) depends
  // on context in a way this component shouldn't guess at.
  value: string;
  size?: TokenBadgeSize;
  // The pre-boost amount, shown crossed out before value — the one existing
  // caller of this (challenge-card.tsx's boosted-reward state) needs the
  // original number to stay visible, not just replaced.
  strikeValue?: string;
}) {
  const s = SIZES[size];
  return (
    <View style={[styles.row, { gap: s.gap }]}>
      <LinearGradient
        colors={[Colors.gold, Colors.goldDeep]}
        start={{ x: 0.15, y: 0.1 }}
        end={{ x: 0.9, y: 1 }}
        style={[styles.coin, { width: s.coin, height: s.coin, borderRadius: s.coin / 2 }]}>
        <CoinIcon size={s.icon} color="#fff" />
      </LinearGradient>
      {strikeValue != null && <Text style={[styles.strike, { fontSize: s.font * 0.75 }]}>{strikeValue}</Text>}
      <Text style={[styles.value, { fontSize: s.font }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  coin: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#7A4E00',
    shadowOpacity: 0.35,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1.5 },
    elevation: 2,
  },
  value: { fontWeight: '800', color: Colors.goldText },
  strike: { fontWeight: '800', color: Colors.goldText, opacity: 0.45, textDecorationLine: 'line-through' },
});
