import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackButton } from '@/components/back-button';
import { BulbIcon, ChevronRightIcon, QuestionIcon } from '@/components/rail-icons';
import { RecommendationModal } from '@/components/recommendation-modal';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useAuthStore } from '@/lib/auth';
import { describeLocalChallengesResult, useGumpaStore } from '@/lib/store';
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

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const setPrivacy = useAuthStore((s) => s.setPrivacy);
  const resendVerification = useAuthStore((s) => s.resendVerification);
  const requestPasswordReset = useAuthStore((s) => s.requestPasswordReset);
  const show = useToastStore((s) => s.show);
  const localChallengesFetchedAt = useGumpaStore((s) => s.localChallengesFetchedAt);
  const refreshLocalChallenges = useGumpaStore((s) => s.refreshLocalChallenges);
  const clearLocalArea = useGumpaStore((s) => s.clearLocalArea);

  const [updatingPrivacy, setUpdatingPrivacy] = useState(false);
  const [updatingLocalTasks, setUpdatingLocalTasks] = useState(false);
  const [resending, setResending] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [recommendModalVisible, setRecommendModalVisible] = useState(false);

  if (!user) return null;

  const localTasksEnabled = localChallengesFetchedAt !== null;

  const handleTogglePrivacy = async (value: boolean) => {
    setUpdatingPrivacy(true);
    const err = await setPrivacy(value);
    setUpdatingPrivacy(false);
    show(err ?? (value ? 'Your quests now post to the public feed too.' : 'Your quests only post to your friends feed now.'));
  };

  // Turning local tasks on/off is a real privacy control (stop using
  // location entirely) — deliberately not paired with any way to force a
  // fresh batch on demand. Local tasks are meant to nudge you out of your
  // comfort zone; a manual "get me a different one" button would just let
  // anyone rewind to something easier. The set still rotates on its own via
  // the background TTL refresh in _layout.tsx.
  const handleToggleLocalTasks = async (value: boolean) => {
    if (!value) {
      clearLocalArea();
      return;
    }
    setUpdatingLocalTasks(true);
    const result = await refreshLocalChallenges(true);
    setUpdatingLocalTasks(false);
    const message = describeLocalChallengesResult(result);
    if (message) show(message);
  };

  const handleResend = async () => {
    setResending(true);
    const err = await resendVerification();
    setResending(false);
    show(err ?? 'Verification email sent. Check your inbox.');
  };

  const handleChangePassword = async () => {
    setSendingReset(true);
    await requestPasswordReset(user.email);
    setSendingReset(false);
    show('If that email has a Gumpa account, a password reset link is on its way. Check your inbox.');
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.two }]}>
      <BackButton />
      <Text style={styles.pageTitle}>Settings</Text>

      <SectionHeader label="Privacy & location" />
      <View style={styles.card}>
        <ToggleRow
          title="Share to public feed"
          desc={
            user.isPublic
              ? 'On: your completed quests show up on the public feed as well as your friends feed.'
              : 'Off: your completed quests only show up on your friends feed.'
          }
          value={user.isPublic}
          onValueChange={handleTogglePrivacy}
          disabled={updatingPrivacy}
        />
        <View style={styles.divider} />
        <ToggleRow
          title="Local tasks"
          desc={
            localTasksEnabled
              ? `Using your location for area-specific tasks. Last updated ${relativeTime(localChallengesFetchedAt!)}.`
              : 'Off: turn on to get tasks tied to real spots near you.'
          }
          value={localTasksEnabled}
          onValueChange={handleToggleLocalTasks}
          disabled={updatingLocalTasks}
        />
      </View>

      <SectionHeader label="Account" />
      <View style={styles.card}>
        {!user.emailVerified && (
          <>
            <ActionRow
              title="Email not verified"
              desc="Resend the verification email to your inbox."
              actionLabel={resending ? 'Sending…' : 'Resend'}
              onPress={handleResend}
              disabled={resending}
            />
            <View style={styles.divider} />
          </>
        )}
        <ActionRow
          title="Change password"
          desc="We'll email you a link to set a new one."
          actionLabel={sendingReset ? 'Sending…' : 'Send link'}
          onPress={handleChangePassword}
          disabled={sendingReset}
        />
        <View style={styles.divider} />
        <Pressable testID="logout-button" style={styles.rowPressable} onPress={logout}>
          <Text style={styles.logoutText}>Log out</Text>
        </Pressable>
      </View>

      <SectionHeader label="Support" />
      <View style={styles.card}>
        <Pressable testID="faq-button" style={styles.navRow} onPress={() => router.push('/faq')}>
          <View style={styles.navRowLeft}>
            <QuestionIcon size={18} color={Colors.accent} />
            <Text style={styles.navRowText}>FAQs</Text>
          </View>
          <ChevronRightIcon size={16} color={Colors.muted} />
        </Pressable>
      </View>

      <SectionHeader label="Feedback" />
      <Pressable testID="recommend-button" onPress={() => setRecommendModalVisible(true)}>
        <LinearGradient colors={[Colors.accent, Colors.accent2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.recommendCard}>
          <View style={styles.recommendIconWrap}>
            <BulbIcon size={22} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.recommendTitle}>Have a recommendation?</Text>
            <Text style={styles.recommendSubtitle}>Click here!</Text>
          </View>
          <ChevronRightIcon size={18} color="#fff" />
        </LinearGradient>
      </Pressable>

      <SectionHeader label="About" />
      <View style={styles.card}>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Gumpa version</Text>
          <Text style={styles.fieldValue}>{Constants.expoConfig?.version ?? '1.0.0'}</Text>
        </View>
      </View>

      <RecommendationModal visible={recommendModalVisible} onClose={() => setRecommendModalVisible(false)} />
    </ScrollView>
  );
}

function SectionHeader({ label }: { label: string }) {
  return <Text style={styles.sectionHeader}>{label}</Text>;
}

function ToggleRow({
  title,
  desc,
  value,
  onValueChange,
  disabled,
}: {
  title: string;
  desc: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled: boolean;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowDesc}>{desc}</Text>
      </View>
      <Switch value={value} onValueChange={onValueChange} disabled={disabled} trackColor={{ true: Colors.accent, false: Colors.line }} />
    </View>
  );
}

function ActionRow({
  title,
  desc,
  actionLabel,
  onPress,
  disabled,
}: {
  title: string;
  desc: string;
  actionLabel: string;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowDesc}>{desc}</Text>
      </View>
      <Pressable onPress={onPress} disabled={disabled} style={styles.actionBtn}>
        <Text style={styles.actionBtnText}>{actionLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.three, paddingBottom: Spacing.six },
  pageTitle: { fontSize: 26, fontWeight: '800', color: Colors.ink, marginBottom: Spacing.three },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.muted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 4,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.card,
    padding: Spacing.three,
    marginBottom: Spacing.four,
  },
  divider: { height: 1, backgroundColor: Colors.line, marginVertical: Spacing.three },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  rowTitle: { fontSize: 15, fontWeight: '800', color: Colors.ink, marginBottom: 3 },
  rowDesc: { fontSize: 12.5, color: Colors.muted, lineHeight: 18 },
  actionBtn: { backgroundColor: Colors.accentSoft, borderRadius: Radius.sm, paddingHorizontal: 12, paddingVertical: 7 },
  actionBtnText: { color: Colors.accent, fontWeight: '800', fontSize: 12 },
  rowPressable: { paddingVertical: 2 },
  logoutText: { color: Colors.red, fontWeight: '800', fontSize: 15 },
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  navRowText: { fontSize: 15, fontWeight: '800', color: Colors.ink },
  field: { gap: 2 },
  fieldLabel: { fontSize: 11, fontWeight: '800', color: Colors.muted, letterSpacing: 0.4 },
  fieldValue: { fontSize: 15.5, fontWeight: '700', color: Colors.ink },
  recommendCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: Radius.card,
    padding: Spacing.three,
    marginBottom: Spacing.four,
  },
  recommendIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recommendTitle: { fontSize: 15, fontWeight: '800', color: '#fff' },
  recommendSubtitle: { fontSize: 12.5, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
});
