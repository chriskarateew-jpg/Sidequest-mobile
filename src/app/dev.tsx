// Gumpa — hidden developer panel: author custom challenges and boost
// payouts. Reached only via a long-press on the Profile avatar (see
// profile.tsx) — that gesture just reveals the door, it grants nothing.
// Real enforcement is server-side (requireDeveloper in server/src/auth.ts):
// the moment this screen can't load admin data, it treats that exactly like
// a route that doesn't exist and bounces back silently, rather than showing
// any "access denied" state that would confirm the feature exists.

import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackButton } from '@/components/back-button';
import { Colors, Radius, Spacing } from '@/constants/theme';
import {
  cancelAdminBoost,
  deleteAdminChallenge,
  deleteAdminTimedChallenge,
  fetchAdminBoosts,
  fetchAdminChallenges,
  fetchAdminTimedChallenges,
  setAdminChallengeActive,
  setAdminTimedChallengeActive,
  type AdminBoost,
  type AdminChallenge,
  type AdminTimedChallenge,
} from '@/lib/admin-api';
import { useAuthStore } from '@/lib/auth';
import { useToastStore } from '@/lib/toast';

function formatCountdown(ts: number): string {
  const diff = ts - Date.now();
  if (diff <= 0) return 'Ended';
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `${mins}m left`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h left`;
  return `${Math.round(hours / 24)}d left`;
}

function boostStatus(boost: AdminBoost): { label: string; color: string } {
  if (boost.cancelledAt) return { label: 'Cancelled', color: Colors.muted };
  if (boost.endsAt <= Date.now()) return { label: 'Expired', color: Colors.muted };
  return { label: formatCountdown(boost.endsAt), color: Colors.green };
}

function timedChallengeStatus(challenge: AdminTimedChallenge): { label: string; color: string } {
  if (!challenge.active) return { label: 'Ended (manual)', color: Colors.muted };
  if (challenge.deadlineAt <= Date.now()) return { label: 'Expired', color: Colors.muted };
  return { label: formatCountdown(challenge.deadlineAt), color: Colors.red };
}

export default function DevScreen() {
  const insets = useSafeAreaInsets();
  const token = useAuthStore((s) => s.token);
  const show = useToastStore((s) => s.show);

  const [loading, setLoading] = useState(true);
  const [challenges, setChallenges] = useState<AdminChallenge[]>([]);
  const [boosts, setBoosts] = useState<AdminBoost[]>([]);
  const [timedChallenges, setTimedChallenges] = useState<AdminTimedChallenge[]>([]);

  const load = useCallback(async () => {
    if (!token) {
      router.back();
      return;
    }
    const [challengesResult, boostsResult, timedResult] = await Promise.all([
      fetchAdminChallenges(token),
      fetchAdminBoosts(token),
      fetchAdminTimedChallenges(token),
    ]);
    if (!challengesResult.ok || !boostsResult.ok || !timedResult.ok) {
      // A 404 on any of these means this account isn't the developer —
      // bounce with no explanation, same as landing on any other
      // nonexistent route. Any other failure (network blip) gets a real
      // message since this tool has no other audience to worry about
      // confusing.
      const notFound =
        (!challengesResult.ok && challengesResult.status === 404) ||
        (!boostsResult.ok && boostsResult.status === 404) ||
        (!timedResult.ok && timedResult.status === 404);
      if (!notFound) {
        show(!challengesResult.ok ? challengesResult.message : !boostsResult.ok ? boostsResult.message : !timedResult.ok ? timedResult.message : 'Something went wrong.');
      }
      router.back();
      return;
    }
    setChallenges(challengesResult.data.challenges);
    setBoosts(boostsResult.data.boosts);
    setTimedChallenges(timedResult.data.challenges);
    setLoading(false);
  }, [token, show]);

  useEffect(() => {
    load();
  }, [load]);

  const handleToggleActive = async (challenge: AdminChallenge, value: boolean) => {
    if (!token) return;
    setChallenges((prev) => prev.map((c) => (c.id === challenge.id ? { ...c, active: value } : c)));
    const result = await setAdminChallengeActive(token, challenge.id, value);
    if (!result.ok) {
      setChallenges((prev) => prev.map((c) => (c.id === challenge.id ? { ...c, active: !value } : c)));
      show(result.message);
    }
  };

  const handleDelete = async (challenge: AdminChallenge) => {
    if (!token) return;
    const result = await deleteAdminChallenge(token, challenge.id);
    if (!result.ok) {
      show(result.message);
      return;
    }
    setChallenges((prev) => prev.map((c) => (c.id === challenge.id ? { ...c, active: false } : c)));
  };

  const handleCancelBoost = async (boost: AdminBoost) => {
    if (!token) return;
    const result = await cancelAdminBoost(token, boost.id);
    if (!result.ok) {
      show(result.message);
      return;
    }
    setBoosts((prev) => prev.map((b) => (b.id === boost.id ? { ...b, cancelledAt: Date.now() } : b)));
  };

  const handleToggleTimedActive = async (challenge: AdminTimedChallenge, value: boolean) => {
    if (!token) return;
    setTimedChallenges((prev) => prev.map((c) => (c.id === challenge.id ? { ...c, active: value } : c)));
    const result = await setAdminTimedChallengeActive(token, challenge.id, value);
    if (!result.ok) {
      setTimedChallenges((prev) => prev.map((c) => (c.id === challenge.id ? { ...c, active: !value } : c)));
      show(result.message);
    }
  };

  const handleDeleteTimed = async (challenge: AdminTimedChallenge) => {
    if (!token) return;
    const result = await deleteAdminTimedChallenge(token, challenge.id);
    if (!result.ok) {
      show(result.message);
      return;
    }
    setTimedChallenges((prev) => prev.map((c) => (c.id === challenge.id ? { ...c, active: false } : c)));
  };

  if (loading) return null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.two }]}>
      <BackButton />
      <Text style={styles.pageTitle}>Developer tools</Text>

      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionHeader}>Tasks (recurring)</Text>
        <Pressable style={styles.addBtn} onPress={() => router.push('/dev-challenge-form')}>
          <Text style={styles.addBtnText}>+ New</Text>
        </Pressable>
      </View>
      <View style={styles.card}>
        {challenges.length === 0 && <Text style={styles.emptyText}>No tasks yet.</Text>}
        {challenges.map((challenge, i) => (
          <View key={challenge.id}>
            {i > 0 && <View style={styles.divider} />}
            <View style={styles.row}>
              <Pressable
                style={styles.rowMain}
                onPress={() => router.push({ pathname: '/dev-challenge-form', params: { challenge: JSON.stringify(challenge) } })}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {challenge.title}
                </Text>
                <Text style={styles.rowDesc}>
                  +{challenge.tokens} · {challenge.cadence} · {challenge.cat}
                  {challenge.verify === 'streak' ? ` · streak/${challenge.streakTarget}` : ''}
                </Text>
              </Pressable>
              <View style={styles.rowActions}>
                <Switch
                  value={challenge.active}
                  onValueChange={(v) => handleToggleActive(challenge, v)}
                  trackColor={{ true: Colors.accent, false: Colors.line }}
                />
                <Pressable hitSlop={8} onPress={() => handleDelete(challenge)}>
                  <Text style={styles.deleteText}>Delete</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionHeader}>Challenges (timed)</Text>
        <Pressable style={styles.addBtn} onPress={() => router.push('/dev-timed-challenge-form')}>
          <Text style={styles.addBtnText}>+ New</Text>
        </Pressable>
      </View>
      <View style={styles.card}>
        {timedChallenges.length === 0 && <Text style={styles.emptyText}>No challenges yet.</Text>}
        {timedChallenges.map((challenge, i) => {
          const status = timedChallengeStatus(challenge);
          return (
            <View key={challenge.id}>
              {i > 0 && <View style={styles.divider} />}
              <View style={styles.row}>
                <Pressable
                  style={styles.rowMain}
                  onPress={() => router.push({ pathname: '/dev-timed-challenge-form', params: { challenge: JSON.stringify(challenge) } })}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {challenge.title}
                  </Text>
                  <Text style={styles.rowDesc}>
                    +{challenge.tokens} · {challenge.cat} · {challenge.durationMinutes}m window
                  </Text>
                </Pressable>
                <View style={styles.rowActions}>
                  <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
                  <View style={styles.rowActionsInline}>
                    <Switch
                      value={challenge.active}
                      onValueChange={(v) => handleToggleTimedActive(challenge, v)}
                      trackColor={{ true: Colors.accent, false: Colors.line }}
                    />
                    <Pressable hitSlop={8} onPress={() => handleDeleteTimed(challenge)}>
                      <Text style={styles.deleteText}>End</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            </View>
          );
        })}
      </View>

      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionHeader}>Active boosts</Text>
        <Pressable style={styles.addBtn} onPress={() => router.push('/dev-boost-form')}>
          <Text style={styles.addBtnText}>+ New</Text>
        </Pressable>
      </View>
      <View style={styles.card}>
        {boosts.length === 0 && <Text style={styles.emptyText}>No boosts yet.</Text>}
        {boosts.map((boost, i) => {
          const status = boostStatus(boost);
          const live = !boost.cancelledAt && boost.endsAt > Date.now();
          return (
            <View key={boost.id}>
              {i > 0 && <View style={styles.divider} />}
              <View style={styles.row}>
                <View style={styles.rowMain}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {boost.challengeTitle ?? boost.challengeId}
                  </Text>
                  <Text style={styles.rowDesc}>+{boost.boostedTokens} tokens</Text>
                </View>
                <View style={styles.rowActions}>
                  <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
                  {live && (
                    <Pressable hitSlop={8} onPress={() => handleCancelBoost(boost)}>
                      <Text style={styles.deleteText}>Cancel</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.three, paddingBottom: Spacing.six },
  pageTitle: { fontSize: 26, fontWeight: '800', color: Colors.ink, marginBottom: Spacing.three },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, marginTop: 4 },
  sectionHeader: { fontSize: 12, fontWeight: '800', color: Colors.muted, letterSpacing: 0.5, textTransform: 'uppercase' },
  addBtn: { backgroundColor: Colors.accentSoft, borderRadius: Radius.sm, paddingHorizontal: 12, paddingVertical: 6 },
  addBtnText: { color: Colors.accent, fontWeight: '800', fontSize: 12.5 },
  card: { backgroundColor: Colors.card, borderRadius: Radius.card, padding: Spacing.three, marginBottom: Spacing.four },
  emptyText: { color: Colors.muted, fontSize: 13.5 },
  divider: { height: 1, backgroundColor: Colors.line, marginVertical: Spacing.two + 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  rowMain: { flex: 1, gap: 3 },
  rowTitle: { fontSize: 14.5, fontWeight: '800', color: Colors.ink },
  rowDesc: { fontSize: 12, color: Colors.muted },
  rowActions: { alignItems: 'flex-end', gap: 6 },
  rowActionsInline: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  deleteText: { color: Colors.red, fontWeight: '800', fontSize: 12 },
  statusText: { fontWeight: '800', fontSize: 11.5 },
});
