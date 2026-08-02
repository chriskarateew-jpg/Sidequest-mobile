import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackButton } from '@/components/back-button';
import { CoinIcon, LockIcon } from '@/components/rail-icons';
import { Colors, Radius, Shadow, Spacing } from '@/constants/theme';
import { apiFetch } from '@/lib/api';
import { useAuthStore } from '@/lib/auth';
import { REWARD_BRANDS, type RewardBrandId } from '@/lib/rewards-data';
import { useGumpaStore } from '@/lib/store';
import { useToastStore } from '@/lib/toast';

// No subscription model exists yet, so every account is locked out of
// redemption for now. Reading from a single constant here means swapping
// in the real check later (e.g. useAuthStore((s) => s.hasGumpaPlus)) is a
// one-line change, not a rewrite of the locked-state UI below.
const HAS_GUMPA_PLUS = false;

export default function RewardsScreen() {
  const insets = useSafeAreaInsets();
  const tokens = useGumpaStore((s) => s.tokens);
  const token = useAuthStore((s) => s.token);
  const show = useToastStore((s) => s.show);

  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1.035, { duration: 900 }), -1, true);
  }, [pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  // Best-effort demand signal for the Gumpa+ pricing/catalog work — nothing
  // in the UI depends on this succeeding, so failures are swallowed.
  const handleTierPress = (brandId: RewardBrandId, amountUsd: number) => {
    show("Gumpa+ and reward redemption are coming soon. Keep earning, you'll be first to know.");
    apiFetch('/rewards/interest', { method: 'POST', token, body: { brandId, amountUsd } }).catch(() => {});
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.two }]}
      showsVerticalScrollIndicator={false}>
      <BackButton />
      <Text style={styles.pageTitle}>Rewards</Text>

      <View style={styles.balanceRow}>
        <View style={styles.balancePill}>
          <CoinIcon size={16} color={Colors.goldText} />
          <Text style={styles.balanceText}>{tokens} coins</Text>
        </View>
        <Animated.View style={pulseStyle}>
          <View style={styles.unlockPill}>
            <LockIcon size={13} color="#fff" />
            <Text style={styles.unlockPillText}>Unlocks with Gumpa+</Text>
          </View>
        </Animated.View>
      </View>

      {REWARD_BRANDS.map((brand) => (
        <View key={brand.id} style={styles.brandCard}>
          <View style={[styles.brandBanner, { backgroundColor: brand.cardColor }, !HAS_GUMPA_PLUS && styles.locked]}>
            <View style={styles.logoBadge}>
              <Image source={brand.logo} style={styles.brandLogo} contentFit="contain" />
            </View>
          </View>
          {!HAS_GUMPA_PLUS && (
            <LinearGradient
              colors={[Colors.accent, Colors.accent2]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.plusBadge}>
              <Text style={styles.plusBadgeText}>G+</Text>
            </LinearGradient>
          )}
          <View style={[styles.brandBody, !HAS_GUMPA_PLUS && styles.locked]}>
            <Text style={styles.brandName}>{brand.name}</Text>
            <Text style={styles.brandBlurb}>{brand.blurb}</Text>
            <View style={styles.tierRow}>
              {brand.tiers.map((t) => (
                <Pressable
                  key={t.amountUsd}
                  style={styles.tierChip}
                  onPress={() => handleTierPress(brand.id, t.amountUsd)}>
                  <Text style={styles.tierAmount}>${t.amountUsd}</Text>
                  <View style={styles.tierCostRow}>
                    <CoinIcon size={11} color={Colors.goldText} />
                    <Text style={styles.tierCost}>{t.coinCost}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      ))}

      <View style={styles.teaserCard}>
        <Text style={styles.teaserTitle}>More on the way</Text>
        <Text style={styles.teaserDesc}>
          We're working on bringing local businesses into Rewards too, for more variety and more ways to spend what
          you've earned.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bg },
  content: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.six },
  pageTitle: { fontSize: 26, fontWeight: '800', color: Colors.accent, marginBottom: Spacing.three, textAlign: 'center' },
  balanceRow: { flexDirection: 'row', gap: 8, marginBottom: Spacing.four, flexWrap: 'wrap', justifyContent: 'center' },
  balancePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.goldSoft,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.pill,
  },
  balanceText: { fontWeight: '800', fontSize: 13.5, color: Colors.goldText },
  unlockPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.pill,
  },
  unlockPillText: { fontWeight: '700', fontSize: 12.5, color: '#fff' },
  brandCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.card,
    overflow: 'hidden',
    marginBottom: Spacing.three,
    ...Shadow,
  },
  locked: { opacity: 0.45 },
  plusBadge: {
    position: 'absolute',
    top: Spacing.two,
    right: Spacing.two,
    minWidth: 32,
    height: 24,
    borderRadius: Radius.pill,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow,
  },
  plusBadgeText: { fontWeight: '800', fontSize: 12, color: '#fff', letterSpacing: 0.2 },
  brandBanner: { height: 90, alignItems: 'center', justifyContent: 'center', padding: Spacing.three },
  logoBadge: {
    backgroundColor: '#fff',
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandLogo: { width: 120, height: 40 },
  brandBody: { padding: Spacing.three },
  brandName: { fontSize: 17, fontWeight: '800', color: Colors.ink, marginBottom: 4 },
  brandBlurb: { color: Colors.muted, fontSize: 13, lineHeight: 17, marginBottom: Spacing.two + 2 },
  tierRow: { flexDirection: 'row', gap: 8 },
  tierChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: Radius.sm,
    backgroundColor: Colors.bg,
    borderWidth: 1.5,
    borderColor: Colors.line,
  },
  tierAmount: { fontWeight: '800', fontSize: 15, color: Colors.ink, marginBottom: 3 },
  tierCostRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  tierCost: { fontWeight: '700', fontSize: 11.5, color: Colors.goldText },
  teaserCard: {
    backgroundColor: Colors.accentSoft,
    borderRadius: Radius.card,
    padding: Spacing.three,
    marginTop: Spacing.one,
  },
  teaserTitle: { fontWeight: '800', fontSize: 14.5, color: Colors.ink, marginBottom: 4 },
  teaserDesc: { color: Colors.muted, fontSize: 13, lineHeight: 17 },
});
