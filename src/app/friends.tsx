import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackButton } from '@/components/back-button';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { apiFetch } from '@/lib/api';
import { useAuthStore } from '@/lib/auth';
import { findChallengeById, useGumpaStore } from '@/lib/store';
import { useToastStore } from '@/lib/toast';

interface FriendRow {
  id: string;
  user_id: string;
  username: string;
  weeklyPosts: number;
}

interface SearchResult {
  id: string;
  username: string;
  status: 'none' | 'pending_outgoing' | 'pending_incoming' | 'friends';
}

interface DuelRow {
  id: string;
  challengerId: string;
  opponentId: string;
  challengeId: string;
  cadence: 'daily' | 'weekly' | 'monthly';
  wager: number;
  status: 'pending' | 'active' | 'completed' | 'expired' | 'declined' | 'cancelled';
  winnerId: string | null;
  endsAt: number | null;
  challengerUsername: string;
  opponentUsername: string;
}

function challengeTitle(id: string): string {
  return findChallengeById(id)?.title ?? id;
}

function timeLeft(endsAt: number | null): string {
  if (!endsAt) return '';
  const ms = endsAt - Date.now();
  if (ms <= 0) return 'ending soon';
  const hours = Math.round(ms / (60 * 60 * 1000));
  if (hours < 24) return `${hours}h left`;
  return `${Math.round(hours / 24)}d left`;
}

export default function FriendsScreen() {
  const insets = useSafeAreaInsets();
  const token = useAuthStore((s) => s.token);
  const myUserId = useAuthStore((s) => s.user?.id);
  if (!token || !myUserId) return null; // unreachable — the whole app is gated behind auth

  return <FriendsContent token={token} myUserId={myUserId} insetTop={insets.top} />;
}

function FriendsContent({ token, myUserId, insetTop }: { token: string; myUserId: string; insetTop: number }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [incoming, setIncoming] = useState<FriendRow[]>([]);
  const [duels, setDuels] = useState<DuelRow[]>([]);
  const [loading, setLoading] = useState(false);
  const show = useToastStore((s) => s.show);
  const getSuggestions = useGumpaStore((s) => s.getSuggestions);

  // The task pool eligible for a duel — today's assigned daily/weekly/monthly
  // challenges. These are currently the same set for every user (assignments
  // aren't personalized yet), so "either person's tasks" is just this list.
  const eligibleChallenges = useMemo(() => {
    const sugg = getSuggestions();
    return [...sugg.daily, ...sugg.weekly, ...sugg.monthly];
  }, [getSuggestions]);

  const [duelTarget, setDuelTarget] = useState<{ id: string; username: string } | null>(null);
  const [duelChallengeId, setDuelChallengeId] = useState<string | null>(null);
  const [duelWager, setDuelWager] = useState('20');
  const [submittingDuel, setSubmittingDuel] = useState(false);

  const loadFriends = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/friends', { token });
      const data = (await res.json()) as { friends?: FriendRow[]; incomingRequests?: FriendRow[] };
      setFriends(data.friends ?? []);
      setIncoming(data.incomingRequests ?? []);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const loadDuels = useCallback(async () => {
    const res = await apiFetch('/duels', { token });
    const data = (await res.json()) as { duels?: DuelRow[] };
    setDuels(data.duels ?? []);
  }, [token]);

  useEffect(() => {
    loadFriends();
    loadDuels();
  }, [loadFriends, loadDuels]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      const res = await apiFetch(`/users/search?q=${encodeURIComponent(q)}`, { token });
      const data = (await res.json()) as { users?: SearchResult[] };
      setResults(data.users ?? []);
    }, 350);
    return () => clearTimeout(timer);
  }, [query, token]);

  const sendRequest = async (toUserId: string) => {
    await apiFetch('/friends/request', { method: 'POST', token, body: { toUserId } });
    setResults((r) => r.map((u) => (u.id === toUserId ? { ...u, status: 'pending_outgoing' } : u)));
  };

  const respond = async (requestId: string, accept: boolean) => {
    await apiFetch('/friends/respond', { method: 'POST', token, body: { requestId, accept } });
    loadFriends();
  };

  const openDuelForm = (friend: FriendRow) => {
    setDuelTarget({ id: friend.user_id, username: friend.username });
    setDuelChallengeId(eligibleChallenges[0]?.id ?? null);
    setDuelWager('20');
  };

  const sendDuel = async () => {
    if (!duelTarget || !duelChallengeId) return;
    const wager = parseInt(duelWager, 10);
    if (!wager || wager <= 0) return show('Wager must be a positive number of tokens.');

    setSubmittingDuel(true);
    try {
      const res = await apiFetch('/duels', {
        method: 'POST',
        token,
        body: { opponentId: duelTarget.id, challengeId: duelChallengeId, wager },
      });
      const data = (await res.json()) as { duel?: unknown; error?: string };
      if (!res.ok || !data.duel) {
        show(data.error ?? "Couldn't send that challenge.");
        return;
      }
      show(`⚔️ Duel sent to @${duelTarget.username}`);
      setDuelTarget(null);
      loadDuels();
    } finally {
      setSubmittingDuel(false);
    }
  };

  const respondDuel = async (duelId: string, accept: boolean) => {
    const res = await apiFetch(`/duels/${duelId}/${accept ? 'accept' : 'decline'}`, { method: 'POST', token });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      show(data.error ?? 'Something went wrong.');
      return;
    }
    if (accept) show('⚔️ Duel accepted. Good luck!');
    loadDuels();
  };

  const cancelDuel = async (duelId: string) => {
    await apiFetch(`/duels/${duelId}/cancel`, { method: 'POST', token });
    loadDuels();
  };

  const visibleDuels = duels.filter((d) => d.status !== 'declined' && d.status !== 'cancelled');

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insetTop + Spacing.two }]}
      data={friends}
      keyExtractor={(f) => f.id}
      refreshControl={
        <RefreshControl
          refreshing={loading}
          onRefresh={() => {
            loadFriends();
            loadDuels();
          }}
        />
      }
      ListHeaderComponent={
        <View>
          <BackButton />
          <Text style={styles.pageTitle}>Gumpa Friends</Text>
          <Text style={styles.pageDesc}>See who's showing up this week, and nudge the ones who aren't.</Text>

          <TextInput
            style={styles.input}
            placeholder="Search by username"
            placeholderTextColor={Colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            value={query}
            onChangeText={setQuery}
          />

          {results.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Results</Text>
              {results.map((u) => (
                <View key={u.id} style={styles.row}>
                  <Text style={styles.rowName}>@{u.username}</Text>
                  <RequestButton status={u.status} onPress={() => sendRequest(u.id)} />
                </View>
              ))}
            </View>
          )}

          {incoming.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Requests</Text>
              {incoming.map((r) => (
                <View key={r.id} style={styles.row}>
                  <Text style={styles.rowName}>@{r.username}</Text>
                  <View style={styles.rowActions}>
                    <Pressable style={styles.btnPrimarySm} onPress={() => respond(r.id, true)}>
                      <Text style={styles.btnPrimarySmText}>Accept</Text>
                    </Pressable>
                    <Pressable style={styles.btnGhostSm} onPress={() => respond(r.id, false)}>
                      <Text style={styles.btnGhostSmText}>Decline</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          )}

          {visibleDuels.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Duels</Text>
              {visibleDuels.map((d) => {
                const iAmChallenger = d.challengerId === myUserId;
                const opponentName = iAmChallenger ? d.opponentUsername : d.challengerUsername;
                const iWon = d.winnerId === myUserId;
                return (
                  <View key={d.id} style={styles.duelRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.duelTitle}>{challengeTitle(d.challengeId)}</Text>
                      <Text style={styles.duelMeta}>
                        vs @{opponentName} · 🪙 {d.wager} each
                        {d.status === 'active' ? ` · ${timeLeft(d.endsAt)}` : ''}
                      </Text>
                    </View>
                    {d.status === 'pending' && !iAmChallenger && (
                      <View style={styles.rowActions}>
                        <Pressable style={styles.btnPrimarySm} onPress={() => respondDuel(d.id, true)}>
                          <Text style={styles.btnPrimarySmText}>Accept</Text>
                        </Pressable>
                        <Pressable style={styles.btnGhostSm} onPress={() => respondDuel(d.id, false)}>
                          <Text style={styles.btnGhostSmText}>Decline</Text>
                        </Pressable>
                      </View>
                    )}
                    {d.status === 'pending' && iAmChallenger && (
                      <Pressable style={styles.btnGhostSm} onPress={() => cancelDuel(d.id)}>
                        <Text style={styles.btnGhostSmText}>Cancel</Text>
                      </Pressable>
                    )}
                    {d.status === 'active' && <Text style={styles.duelStatusActive}>In progress</Text>}
                    {d.status === 'completed' && (
                      <Text style={iWon ? styles.duelStatusWin : styles.duelStatusLoss}>
                        {iWon ? `+${d.wager * 2}` : 'Lost'}
                      </Text>
                    )}
                    {d.status === 'expired' && <Text style={styles.duelStatusExpired}>Expired, refunded</Text>}
                  </View>
                );
              })}
            </View>
          )}

          {duelTarget && (
            <View style={styles.duelForm}>
              <Text style={styles.duelFormTitle}>Challenge @{duelTarget.username}</Text>
              <Text style={styles.potFormLabel}>Pick a task (today's daily / weekly / monthly)</Text>
              <View style={styles.duelChallengeGrid}>
                {eligibleChallenges.map((c) => (
                  <Pressable
                    key={c.id}
                    style={[styles.duelChip, duelChallengeId === c.id && styles.duelChipActive]}
                    onPress={() => setDuelChallengeId(c.id)}>
                    <Text style={[styles.duelChipText, duelChallengeId === c.id && styles.duelChipTextActive]}>
                      {c.title}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.duelFormRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.potFormLabel}>Wager (🪙 each)</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="number-pad"
                    value={duelWager}
                    onChangeText={setDuelWager}
                  />
                </View>
              </View>
              <View style={styles.rowActions}>
                <Pressable
                  style={[styles.submitBtn, submittingDuel && styles.btnDisabled]}
                  disabled={submittingDuel}
                  onPress={sendDuel}>
                  <Text style={styles.btnPrimarySmText}>{submittingDuel ? 'Sending…' : 'Send challenge'}</Text>
                </Pressable>
                <Pressable style={styles.btnGhostSm} onPress={() => setDuelTarget(null)}>
                  <Text style={styles.btnGhostSmText}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          )}

          <Text style={styles.sectionTitle}>Your friends · most active first</Text>
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.row}>
          <Text style={styles.rowName}>@{item.username}</Text>
          <View style={styles.rowActions}>
            <View style={[styles.activityChip, item.weeklyPosts === 0 && styles.activityChipQuiet]}>
              <Text style={[styles.activityChipText, item.weeklyPosts === 0 && styles.activityChipTextQuiet]}>
                {item.weeklyPosts > 0 ? `🔥 ${item.weeklyPosts} this week` : 'Quiet this week'}
              </Text>
            </View>
            <Pressable style={styles.duelBtn} onPress={() => openDuelForm(item)}>
              <Text style={styles.duelBtnText}>⚔️</Text>
            </Pressable>
          </View>
        </View>
      )}
      ListEmptyComponent={<Text style={styles.empty}>No friends yet. Search above to send a request.</Text>}
    />
  );
}

function RequestButton({ status, onPress }: { status: SearchResult['status']; onPress: () => void }) {
  if (status === 'friends') return <Text style={styles.statusText}>✓ Friends</Text>;
  if (status === 'pending_outgoing') return <Text style={styles.statusText}>Requested</Text>;
  if (status === 'pending_incoming') return <Text style={styles.statusText}>Check requests</Text>;
  return (
    <Pressable style={styles.btnPrimarySm} onPress={onPress}>
      <Text style={styles.btnPrimarySmText}>Add</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bg },
  content: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.six },
  pageTitle: { fontSize: 26, fontWeight: '800', color: Colors.accent, marginBottom: 6, textAlign: 'center' },
  pageDesc: { color: Colors.muted, fontSize: 13.5, lineHeight: 18, marginBottom: Spacing.three },
  input: {
    backgroundColor: Colors.card,
    borderWidth: 1.5,
    borderColor: Colors.line,
    borderRadius: Radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: Colors.ink,
    marginBottom: Spacing.three,
  },
  section: { marginBottom: Spacing.three },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: Colors.muted, marginBottom: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: Colors.card,
    borderRadius: Radius.sm,
    marginBottom: 8,
  },
  rowName: { fontWeight: '800', fontSize: 14, color: Colors.ink },
  activityChip: { backgroundColor: Colors.accentSoft, borderRadius: Radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  activityChipQuiet: { backgroundColor: Colors.bg },
  activityChipText: { fontSize: 11.5, fontWeight: '800', color: Colors.accent },
  activityChipTextQuiet: { color: Colors.muted },
  rowActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  statusText: { fontSize: 12.5, fontWeight: '700', color: Colors.muted },
  btnPrimarySm: { backgroundColor: Colors.accent, borderRadius: Radius.sm, paddingHorizontal: 14, paddingVertical: 8 },
  btnPrimarySmText: { color: '#fff', fontWeight: '800', fontSize: 12.5 },
  btnGhostSm: { borderWidth: 1.5, borderColor: Colors.line, borderRadius: Radius.sm, paddingHorizontal: 14, paddingVertical: 8 },
  btnGhostSmText: { color: Colors.ink, fontWeight: '800', fontSize: 12.5 },
  btnDisabled: { opacity: 0.5 },
  empty: { textAlign: 'center', color: Colors.muted, paddingVertical: 40 },
  duelBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  duelBtnText: { fontSize: 14 },
  duelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: Colors.card,
    borderRadius: Radius.sm,
    marginBottom: 8,
    gap: 8,
  },
  duelTitle: { fontWeight: '800', fontSize: 13.5, color: Colors.ink },
  duelMeta: { fontSize: 11.5, color: Colors.muted, marginTop: 2 },
  duelStatusActive: { fontSize: 11.5, fontWeight: '800', color: Colors.accent },
  duelStatusWin: { fontSize: 13, fontWeight: '800', color: Colors.green },
  duelStatusLoss: { fontSize: 12, fontWeight: '800', color: Colors.muted },
  duelStatusExpired: { fontSize: 11, fontWeight: '700', color: Colors.muted },
  duelForm: { backgroundColor: Colors.card, borderRadius: Radius.card, padding: Spacing.three, gap: 8, marginBottom: Spacing.three },
  duelFormTitle: { fontSize: 15.5, fontWeight: '800', color: Colors.ink, marginBottom: 2 },
  potFormLabel: { fontSize: 10.5, fontWeight: '800', color: Colors.muted },
  duelChallengeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  duelChip: {
    borderWidth: 1.5,
    borderColor: Colors.line,
    borderRadius: Radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  duelChipActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  duelChipText: { fontSize: 12, fontWeight: '700', color: Colors.muted },
  duelChipTextActive: { color: '#fff' },
  duelFormRow: { flexDirection: 'row', gap: 8 },
  submitBtn: { backgroundColor: Colors.accent, borderRadius: Radius.sm, paddingHorizontal: 18, paddingVertical: 10, justifyContent: 'center' },
});
