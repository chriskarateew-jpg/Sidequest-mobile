import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackButton } from '@/components/back-button';
import { GumpaPlusModal } from '@/components/gumpa-plus-modal';
import { LockIcon } from '@/components/rail-icons';
import { TokenBadge } from '@/components/token-badge';
import { Colors, Radius, Shadow, Spacing } from '@/constants/theme';
import { apiFetch } from '@/lib/api';
import { useAuthStore } from '@/lib/auth';
import { REWARD_BRANDS, type RewardBrandId } from '@/lib/rewards-data';
import { useGumpaStore } from '@/lib/store';
import { useToastStore } from '@/lib/toast';

// No subscription model exists yet, so every account is locked out of
// redemption for now. Reading from a single constant here means swapping
// in the real check later (e.g. useAuthStore((s) => s.hasGumpaPlus)) is a
// one-line change, not a rewrite of the locked-state UI below. The redeem
// call path below (POST /rewards/redeem, server/src/rewards.ts) is already
// real and cap-enforced — it just has nothing to reach until this flips.
const HAS_GUMPA_PLUS = false;

// Tap-to-confirm rather than a native Alert: this app never uses
// Alert.alert anywhere (its web build via react-native-web has spotty
// support for it) — see src/app/completed.tsx for the same pattern used on
// post deletion. A real redemption spends real tokens, so it gets the same
// two-tap guard.
const REDEEM_CONFIRM_TIMEOUT_MS = 4000;

export default function RewardsScreen() {
  const insets = useSafeAreaInsets();
  const tokens = useGumpaStore((s) => s.tokens);
  const syncTokens = useGumpaStore((s) => s.syncTokens);
  const token = useAuthStore((s) => s.token);
  const show = useToastStore((s) => s.show);

  const [confirmingKey, setConfirmingKey] = useState<string | null>(null);
  const confirmResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showGumpaPlusModal, setShowGumpaPlusModal] = useState(false);

  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1.035, { duration: 900 }), -1, true);
  }, [pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  const redeem = async (brandId: RewardBrandId, amountUsd: number) => {
    try {
      const res = await apiFetch('/rewards/redeem', { method: 'POST', token, body: { brandId, amountUsd } });
      const data = (await res.json()) as {
        error?: string;
        balance?: number;
        redeemedThisCycle?: number;
        capUsd?: number;
      };
      if (!res.ok) {
        show(data.error ?? 'Something went wrong redeeming that.');
        return;
      }
      if (typeof data.balance === 'number') syncTokens(data.balance);
      show(`Redeemed a $${amountUsd} ${brandId} reward. Gift card details are on the way.`);
    } catch {
      show('Network error, try again.');
    }
  };

  // Opens the paywall instead of just a toast — tapping a specific locked
  // tier is exactly the moment someone's curious enough to be shown the
  // full pitch, not just told "soon."
  const handleSubscribePress = () => {
    setShowGumpaPlusModal(false);
    show("Gumpa+ is coming soon. Keep earning, you'll be first to know.");
  };

  const handleTierPress = (brandId: RewardBrandId, amountUsd: number) => {
    if (!HAS_GUMPA_PLUS) {
      // Best-effort demand signal for the Gumpa+ pricing/catalog work —
      // nothing in the UI depends on this succeeding, so failures are
      // swallowed.
      apiFetch('/rewards/interest', { method: 'POST', token, body: { brandId, amountUsd } }).catch(() => {});
      setShowGumpaPlusModal(true);
      return;
    }

    const key = `${brandId}:${amountUsd}`;
    if (confirmingKey === key) {
      if (confirmResetTimer.current) clearTimeout(confirmResetTimer.current);
      setConfirmingKey(null);
      redeem(brandId, amountUsd);
      return;
    }
    setConfirmingKey(key);
    if (confirmResetTimer.current) clearTimeout(confirmResetTimer.current);
    confirmResetTimer.current = setTimeout(() => setConfirmingKey(null), REDEEM_CONFIRM_TIMEOUT_MS);
  };

  return (
    <>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.two }]}
        showsVerticalScrollIndicator={false}>
        <BackButton />
        <Text style={styles.pageTitle}>Rewards</Text>

        <View style={styles.balanceRow}>
          <View style={styles.balancePill}>
            <TokenBadge value={`${tokens} coins`} size="md" />
          </View>
          <Animated.View style={pulseStyle}>
            <Pressable testID="unlock-gumpa-plus-pill" style={styles.unlockPill} onPress={() => setShowGumpaPlusModal(true)}>
              <LockIcon size={13} color="#fff" />
              <Text style={styles.unlockPillText}>Unlocks with Gumpa+</Text>
            </Pressable>
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
              <Pressable testID={`gumpa-plus-badge-${brand.id}`} style={styles.plusBadgeWrap} onPress={() => setShowGumpaPlusModal(true)}>
                <LinearGradient
                  colors={[Colors.accent, Colors.accent2]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.plusBadge}>
                  <Text style={styles.plusBadgeText}>G+</Text>
                </LinearGradient>
              </Pressable>
            )}
            <View style={[styles.brandBody, !HAS_GUMPA_PLUS && styles.locked]}>
              <Text style={styles.brandName}>{brand.name}</Text>
              <Text style={styles.brandBlurb}>{brand.blurb}</Text>
              <View style={styles.tierRow}>
                {brand.tiers.map((t) => {
                  const confirming = HAS_GUMPA_PLUS && confirmingKey === `${brand.id}:${t.amountUsd}`;
                  return (
                    <Pressable
                      key={t.amountUsd}
                      style={[styles.tierChip, confirming && styles.tierChipConfirming]}
                      onPress={() => handleTierPress(brand.id, t.amountUsd)}>
                      {confirming ? (
                        <Text style={styles.tierConfirmText}>Tap to redeem</Text>
                      ) : (
                        <>
                          <Text style={styles.tierAmount}>${t.amountUsd}</Text>
                          <TokenBadge value={String(t.coinCost)} size="sm" />
                        </>
                      )}
                    </Pressable>
                  );
                })}
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
      <GumpaPlusModal
        visible={showGumpaPlusModal}
        onClose={() => setShowGumpaPlusModal(false)}
        onSubscribe={handleSubscribePress}
      />
    </>
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
  plusBadgeWrap: { position: 'absolute', top: Spacing.two, right: Spacing.two, ...Shadow },
  plusBadge: {
    minWidth: 32,
    height: 24,
    borderRadius: Radius.pill,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
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
  tierChipConfirming: { backgroundColor: Colors.accentSoft, borderColor: Colors.accent },
  tierConfirmText: { fontWeight: '800', fontSize: 12.5, color: Colors.accent, textAlign: 'center' },
  tierAmount: { fontWeight: '800', fontSize: 15, color: Colors.ink, marginBottom: 3 },
  teaserCard: {
    backgroundColor: Colors.accentSoft,
    borderRadius: Radius.card,
    padding: Spacing.three,
    marginTop: Spacing.one,
  },
  teaserTitle: { fontWeight: '800', fontSize: 14.5, color: Colors.ink, marginBottom: 4 },
  teaserDesc: { color: Colors.muted, fontSize: 13, lineHeight: 17 },
});
