import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackButton } from '@/components/back-button';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useAuthStore } from '@/lib/auth';
import { describeLocalChallengesResult, levelInfo, useSidequestStore } from '@/lib/store';
import { useToastStore } from '@/lib/toast';

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const setPrivacy = useAuthStore((s) => s.setPrivacy);
  const resendVerification = useAuthStore((s) => s.resendVerification);
  const show = useToastStore((s) => s.show);
  const tokens = useSidequestStore((s) => s.tokens);
  const xp = useSidequestStore((s) => s.xp);
  const currentStreak = useSidequestStore((s) => s.currentStreak);
  const localChallengesFetchedAt = useSidequestStore((s) => s.localChallengesFetchedAt);
  const refreshLocalChallenges = useSidequestStore((s) => s.refreshLocalChallenges);
  const clearLocalArea = useSidequestStore((s) => s.clearLocalArea);

  const [updatingPrivacy, setUpdatingPrivacy] = useState(false);
  const [resending, setResending] = useState(false);
  const [refreshingLocation, setRefreshingLocation] = useState(false);

  if (!user) return null;

  const lvl = levelInfo(xp);
  const streak = currentStreak();
  const localTasksEnabled = localChallengesFetchedAt !== null;

  const handleTogglePrivacy = async (value: boolean) => {
    setUpdatingPrivacy(true);
    const err = await setPrivacy(value);
    setUpdatingPrivacy(false);
    show(err ?? (value ? 'Your quests now post to the public feed too.' : 'Your quests only post to your friends feed now.'));
  };

  const handleResend = async () => {
    setResending(true);
    const err = await resendVerification();
    setResending(false);
    show(err ?? 'Verification email sent — check your inbox.');
  };

  const handleToggleLocalTasks = async (value: boolean) => {
    if (!value) {
      clearLocalArea();
      return;
    }
    setRefreshingLocation(true);
    const result = await refreshLocalChallenges(true);
    setRefreshingLocation(false);
    const message = describeLocalChallengesResult(result);
    if (message) show(message);
  };

  const handleRefreshLocation = async () => {
    setRefreshingLocation(true);
    const result = await refreshLocalChallenges(true);
    setRefreshingLocation(false);
    const message = describeLocalChallengesResult(result);
    if (message) show(message);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.two }]}>
      <BackButton />
      <Text style={styles.pageTitle}>Profile</Text>

      <View style={styles.card}>
        <View style={styles.statsRow}>
          <Stat value={`🪙 ${tokens.toLocaleString()}`} label="TOKENS" />
          <Stat value={`🔥 ${streak}`} label="DAY STREAK" />
          <Stat value={`⭐ ${lvl.level}`} label="LEVEL" />
        </View>
        <View style={styles.xpBar}>
          <View style={[styles.xpFill, { width: `${Math.round(lvl.progress * 100)}%` }]} />
        </View>
        <Text style={styles.xpHint}>{lvl.toNext} 🪙 to level {lvl.level + 1}</Text>
      </View>

      <View style={styles.card}>
        <Field label="Username" value={`@${user.username}`} />
        <View style={styles.divider} />
        <Field label="Email" value={user.email} />
        {user.emailVerified ? (
          <Text style={styles.verified}>Verified</Text>
        ) : (
          <View style={styles.unverifiedRow}>
            <Text style={styles.unverified}>Not verified</Text>
            <Pressable onPress={handleResend} disabled={resending} style={styles.resendBtn}>
              <Text style={styles.resendBtnText}>{resending ? 'Sending…' : 'Resend email'}</Text>
            </Pressable>
          </View>
        )}
      </View>

      <View style={styles.card}>
        <View style={styles.privacyRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.privacyTitle}>Share to public feed</Text>
            <Text style={styles.privacyDesc}>
              {user.isPublic
                ? 'On — your completed quests show up on the public feed as well as your friends feed.'
                : 'Off — your completed quests only show up on your friends feed.'}
            </Text>
          </View>
          <Switch
            value={user.isPublic}
            onValueChange={handleTogglePrivacy}
            disabled={updatingPrivacy}
            trackColor={{ true: Colors.accent, false: Colors.line }}
          />
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.privacyRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.privacyTitle}>Local tasks</Text>
            <Text style={styles.privacyDesc}>
              {localTasksEnabled
                ? `Using your location for area-specific tasks. Last updated ${relativeTime(localChallengesFetchedAt!)}.`
                : 'Off — turn on to get tasks tied to real spots near you.'}
            </Text>
          </View>
          <Switch
            value={localTasksEnabled}
            onValueChange={handleToggleLocalTasks}
            disabled={refreshingLocation}
            trackColor={{ true: Colors.accent, false: Colors.line }}
          />
        </View>
        {localTasksEnabled && (
          <Pressable onPress={handleRefreshLocation} disabled={refreshingLocation} style={styles.resendBtn}>
            <Text style={styles.resendBtnText}>{refreshingLocation ? 'Refreshing…' : 'Refresh now'}</Text>
          </Pressable>
        )}
      </View>

      <Pressable style={styles.logoutBtn} onPress={logout}>
        <Text style={styles.logoutBtnText}>Log out</Text>
      </Pressable>
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

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.three, paddingBottom: Spacing.six },
  pageTitle: { fontSize: 26, fontWeight: '800', color: Colors.ink, marginBottom: Spacing.three },
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.card,
    padding: Spacing.three + 4,
    marginBottom: Spacing.three,
  },
  field: { gap: 2 },
  fieldLabel: { fontSize: 11, fontWeight: '800', color: Colors.muted, letterSpacing: 0.4 },
  fieldValue: { fontSize: 15.5, fontWeight: '700', color: Colors.ink },
  divider: { height: 1, backgroundColor: Colors.line, marginVertical: Spacing.two + 2 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around' },
  stat: { gap: 2, alignItems: 'center' },
  statValue: { fontSize: 16, fontWeight: '800', color: Colors.ink },
  statLabel: { fontSize: 10, fontWeight: '800', color: Colors.muted, letterSpacing: 0.4 },
  xpBar: { height: 9, backgroundColor: Colors.line, borderRadius: 999, overflow: 'hidden', marginTop: Spacing.three },
  xpFill: { height: '100%', backgroundColor: Colors.accent, borderRadius: 999 },
  xpHint: { fontSize: 11, fontWeight: '700', color: Colors.muted, marginTop: 6, textAlign: 'center' },
  verified: { color: Colors.green, fontWeight: '800', fontSize: 12.5, marginTop: 6 },
  unverifiedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  unverified: { color: Colors.red, fontWeight: '800', fontSize: 12.5 },
  resendBtn: { backgroundColor: Colors.accentSoft, borderRadius: Radius.sm, paddingHorizontal: 12, paddingVertical: 7 },
  resendBtnText: { color: Colors.accent, fontWeight: '800', fontSize: 12 },
  privacyRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  privacyTitle: { fontSize: 15, fontWeight: '800', color: Colors.ink, marginBottom: 3 },
  privacyDesc: { fontSize: 12.5, color: Colors.muted, lineHeight: 18 },
  logoutBtn: {
    borderWidth: 1.5,
    borderColor: Colors.line,
    borderRadius: Radius.sm,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  logoutBtnText: { color: Colors.red, fontWeight: '800', fontSize: 15 },
});
