import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import type { ComponentType } from 'react';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActivityCalendar } from '@/components/activity-calendar';
import { BackButton } from '@/components/back-button';
import { CameraIcon, ChevronRightIcon, LevelIcon, ProfileIcon, SettingsIcon, StoreIcon, StreakIcon } from '@/components/rail-icons';
import { TokenBadge } from '@/components/token-badge';
import { Colors, Radius, Shadow, Spacing } from '@/constants/theme';
import { photoUrl } from '@/lib/api';
import { useAuthStore } from '@/lib/auth';
import { pickPhotoFromLibrary } from '@/lib/photo';
import { fetchMyPosts, type MyPost } from '@/lib/posts';
import { levelInfo, useGumpaStore } from '@/lib/store';
import { useToastStore } from '@/lib/toast';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const setAvatar = useAuthStore((s) => s.setAvatar);
  const show = useToastStore((s) => s.show);
  const tokens = useGumpaStore((s) => s.tokens);
  const xp = useGumpaStore((s) => s.xp);
  const currentStreak = useGumpaStore((s) => s.currentStreak);

  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [posts, setPosts] = useState<MyPost[]>([]);

  useEffect(() => {
    if (!token) return;
    fetchMyPosts(token).then((result) => {
      if (result.status === 'ok') setPosts(result.posts);
    });
  }, [token]);

  // A slow, gentle pulse on the token coin — same motion language as
  // rewards.tsx's "Unlocks with Gumpa+" pill — so the one stat that
  // represents real earned value feels distinct from the static Streak/
  // Level pair, not just differently colored.
  const coinPulse = useSharedValue(1);
  useEffect(() => {
    coinPulse.value = withRepeat(withTiming(1.05, { duration: 1100 }), -1, true);
  }, [coinPulse]);
  const coinPulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: coinPulse.value }] }));

  if (!user) return null;

  const lvl = levelInfo(xp);
  const streak = currentStreak();

  const handleChangeAvatar = async () => {
    const result = await pickPhotoFromLibrary();
    if (result.status === 'denied') {
      show('Photo library access is required to set a profile picture.');
      return;
    }
    if (result.status !== 'ok') return;
    setUploadingAvatar(true);
    const err = await setAvatar(result.base64, result.mediaType);
    setUploadingAvatar(false);
    show(err ?? 'Profile picture updated.');
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.two }]}>
      <View style={styles.headerRow}>
        <BackButton />
        <Pressable
          testID="settings-button"
          hitSlop={8}
          style={styles.settingsBtn}
          onPress={() => router.push('/settings')}>
          <SettingsIcon size={18} color={Colors.ink} />
        </Pressable>
      </View>
      <View style={styles.avatarSection}>
        <Pressable
          testID="avatar-change-button"
          style={styles.avatarWrap}
          onPress={handleChangeAvatar}
          onLongPress={() => router.push('/dev')}
          disabled={uploadingAvatar}>
          {user.avatarKey ? (
            <Image source={{ uri: photoUrl(user.avatarKey) }} style={styles.avatarImg} contentFit="cover" />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <ProfileIcon size={30} color={Colors.accent} />
            </View>
          )}
          <View style={styles.avatarEditBadge}>
            <CameraIcon size={11} color="#fff" />
          </View>
        </Pressable>
        <Text style={styles.avatarHint}>{uploadingAvatar ? 'Uploading…' : 'Tap to change photo'}</Text>
      </View>

      <View style={styles.tokenHero}>
        <Animated.View style={coinPulseStyle}>
          <TokenBadge value={tokens.toLocaleString()} size="lg" />
        </Animated.View>
        <Text style={styles.tokenHeroLabel}>YOUR TOKENS</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.statsRow}>
          <Stat Icon={StreakIcon} value={String(streak)} label="DAY STREAK" />
          <Stat Icon={LevelIcon} value={String(lvl.level)} label="LEVEL" />
        </View>
        <View style={styles.xpBar}>
          <View style={[styles.xpFill, { width: `${Math.round(lvl.progress * 100)}%` }]} />
        </View>
        <Text style={styles.xpHint}>{lvl.toNext} to level {lvl.level + 1}</Text>
      </View>

      <ActivityCalendar posts={posts} />

      <Pressable testID="store-link" style={styles.linkCard} onPress={() => router.push('/store')}>
        <View style={styles.linkIconBadge}>
          <StoreIcon size={18} color={Colors.accent} />
        </View>
        <View style={styles.linkBody}>
          <Text style={styles.linkTitle}>Store</Text>
          <Text style={styles.linkSubtitle}>One-time boosts, paid separately from Gumpa+</Text>
        </View>
        <ChevronRightIcon size={16} color={Colors.muted} />
      </Pressable>

      <View style={styles.card}>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Username</Text>
          <View style={styles.usernameRow}>
            <Text style={styles.fieldValue}>@{user.username}</Text>
            {user.hasGumpaPlus && (
              <LinearGradient
                colors={[Colors.accent, Colors.accent2]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.plusFlare}>
                <Text style={styles.plusFlareText}>GUMPA+</Text>
              </LinearGradient>
            )}
          </View>
        </View>
        <View style={styles.divider} />
        <Field label="Email" value={user.email} />
        {user.emailVerified ? (
          <Text style={styles.verified}>Verified</Text>
        ) : (
          <Text style={styles.unverified}>Not verified. Resend from Settings.</Text>
        )}
      </View>
    </ScrollView>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

function Stat({ Icon, value, label }: { Icon: ComponentType<{ size?: number; color?: string }>; value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Icon size={19} color={Colors.accent} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.three, paddingBottom: Spacing.six },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  settingsBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.three,
  },
  avatarSection: { alignItems: 'center', marginBottom: Spacing.three },
  avatarWrap: { position: 'relative' },
  avatarImg: { width: 84, height: 84, borderRadius: 42, backgroundColor: Colors.line },
  avatarPlaceholder: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: Colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEditBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.accent,
    borderWidth: 2,
    borderColor: Colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow,
  },
  avatarHint: { fontSize: 12, fontWeight: '700', color: Colors.muted, marginTop: 8 },
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.card,
    padding: Spacing.three + 4,
    marginBottom: Spacing.three,
  },
  // Pulled out of the stats row on purpose — tokens are the one stat with
  // real earned value behind it, so they get their own gold-tinted card
  // instead of sitting as a same-weight third alongside Streak/Level.
  tokenHero: {
    backgroundColor: Colors.goldSoft,
    borderRadius: Radius.card,
    paddingVertical: Spacing.four,
    alignItems: 'center',
    gap: 8,
    marginBottom: Spacing.three,
    ...Shadow,
  },
  tokenHeroLabel: { fontSize: 11.5, fontWeight: '800', color: Colors.goldText, letterSpacing: 0.6 },
  linkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    backgroundColor: Colors.card,
    borderRadius: Radius.card,
    padding: Spacing.three,
    marginBottom: Spacing.three,
    ...Shadow,
  },
  linkIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkBody: { flex: 1, gap: 1 },
  linkTitle: { fontSize: 14.5, fontWeight: '800', color: Colors.ink },
  linkSubtitle: { fontSize: 11.5, color: Colors.muted },
  field: { gap: 2 },
  fieldLabel: { fontSize: 11, fontWeight: '800', color: Colors.muted, letterSpacing: 0.4 },
  fieldValue: { fontSize: 15.5, fontWeight: '700', color: Colors.ink },
  usernameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // Cosmetic-only Gumpa+ flare (docs/gumpa-plus-perks-roadmap.md Phase 2) —
  // own-profile only for now, matching that phase's documented default.
  plusFlare: { borderRadius: Radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  plusFlareText: { fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: 0.4 },
  divider: { height: 1, backgroundColor: Colors.line, marginVertical: Spacing.two + 2 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around' },
  stat: { gap: 4, alignItems: 'center' },
  statValue: { fontSize: 16, fontWeight: '800', color: Colors.ink },
  statLabel: { fontSize: 10, fontWeight: '800', color: Colors.muted, letterSpacing: 0.4 },
  xpBar: { height: 9, backgroundColor: Colors.line, borderRadius: 999, overflow: 'hidden', marginTop: Spacing.three },
  xpFill: { height: '100%', backgroundColor: Colors.accent, borderRadius: 999 },
  xpHint: { fontSize: 11, fontWeight: '700', color: Colors.muted, marginTop: 6, textAlign: 'center' },
  verified: { color: Colors.green, fontWeight: '800', fontSize: 12.5, marginTop: 6 },
  unverified: { color: Colors.red, fontWeight: '800', fontSize: 12.5, marginTop: 6 },
});
