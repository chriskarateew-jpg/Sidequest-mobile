import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackButton } from '@/components/back-button';
import { Colors, Radius, Shadow, Spacing } from '@/constants/theme';
import { apiFetch, photoUrl } from '@/lib/api';
import { useAuthStore } from '@/lib/auth';
import { pickPhotoFromLibrary } from '@/lib/photo';
import { useToastStore } from '@/lib/toast';

interface GroupRow {
  id: string;
  name: string;
  inviteCode: string;
  memberCount: number;
  pictureKey: string | null;
  location: string | null;
}

interface GroupMember {
  userId: string;
  username: string;
  weeklyPosts: number;
}

interface GroupDetail {
  id: string;
  name: string;
  inviteCode: string;
  pictureKey: string | null;
  location: string | null;
  members: GroupMember[];
}

interface PotSummary {
  id: string;
  groupId: string;
  createdBy: string;
  buyIn: number;
  thresholdCount: number;
  splitMethod: 'even' | 'weighted';
  startsAt: number;
  endsAt: number;
  status: 'open' | 'resolved';
  entryCount: number;
  totalTokens: number;
  joined: boolean;
}

interface PotEntry {
  userId: string;
  username: string;
  postCount: number;
  qualified: boolean | null;
  payout: number | null;
}

interface PotDetail extends PotSummary {
  entries: PotEntry[];
}

const MIN_POT_DAYS = 3;
const MAX_POT_DAYS = 30;

function daysLeft(endsAt: number): string {
  const ms = endsAt - Date.now();
  if (ms <= 0) return 'ending soon';
  const days = Math.ceil(ms / (24 * 60 * 60 * 1000));
  return days === 1 ? '1 day left' : `${days} days left`;
}

type Mode = 'none' | 'create' | 'join';

export default function GroupsScreen() {
  const insets = useSafeAreaInsets();
  const token = useAuthStore((s) => s.token);
  const show = useToastStore((s) => s.show);

  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<Mode>('none');
  const [nameInput, setNameInput] = useState('');
  const [locationInput, setLocationInput] = useState('');
  const [picture, setPicture] = useState<{ uri: string; base64: string; mediaType: string } | null>(null);
  const [codeInput, setCodeInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, GroupDetail>>({});
  const [detailLoading, setDetailLoading] = useState<string | null>(null);

  const loadGroups = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/groups', { token });
      const data = (await res.json()) as { groups?: GroupRow[] };
      setGroups(data.groups ?? []);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const handlePickPicture = async () => {
    const result = await pickPhotoFromLibrary();
    if (result.status === 'ok') setPicture({ uri: result.uri, base64: result.base64, mediaType: result.mediaType });
    else if (result.status === 'denied') show('Photo library access is required to set a group picture.');
  };

  const handleCreate = async () => {
    const name = nameInput.trim();
    if (!name) return;
    setSubmitting(true);
    try {
      const res = await apiFetch('/groups', {
        method: 'POST',
        token,
        body: {
          name,
          location: locationInput.trim() || undefined,
          pictureBase64: picture?.base64,
          mediaType: picture?.mediaType,
        },
      });
      const data = (await res.json()) as { group?: GroupRow; error?: string };
      if (!res.ok || !data.group) {
        show(data.error ?? "Couldn't create that group.");
        return;
      }
      show(`✨ "${data.group.name}" created. Invite code ${data.group.inviteCode}`);
      setNameInput('');
      setLocationInput('');
      setPicture(null);
      setMode('none');
      loadGroups();
    } finally {
      setSubmitting(false);
    }
  };

  const handleJoin = async () => {
    const inviteCode = codeInput.trim();
    if (!inviteCode) return;
    setSubmitting(true);
    try {
      const res = await apiFetch('/groups/join', { method: 'POST', token, body: { inviteCode } });
      const data = (await res.json()) as { group?: { name: string }; error?: string };
      if (!res.ok || !data.group) {
        show(data.error ?? "Couldn't join that group.");
        return;
      }
      show(`👋 Joined "${data.group.name}"`);
      setCodeInput('');
      setMode('none');
      loadGroups();
    } finally {
      setSubmitting(false);
    }
  };

  const toggleExpand = async (groupId: string) => {
    if (expandedId === groupId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(groupId);
    if (!details[groupId]) {
      setDetailLoading(groupId);
      try {
        const res = await apiFetch(`/groups/${groupId}`, { token });
        const data = (await res.json()) as { group?: GroupDetail };
        if (data.group) setDetails((prev) => ({ ...prev, [groupId]: data.group! }));
      } finally {
        setDetailLoading(null);
      }
    }
  };

  return (
    <View style={styles.screen}>
      <FlatList
        data={groups}
        keyExtractor={(g) => g.id}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.two }]}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadGroups} />}
        ListHeaderComponent={
          <View>
            <BackButton />
            <Text style={styles.pageTitle}>Groups</Text>
            <Text style={styles.pageDesc}>
              Small crews keep each other honest. See who's posting this week and hold the group accountable.
            </Text>

            <View style={styles.modeRow}>
              <Pressable
                style={[styles.modeBtn, mode === 'create' && styles.modeBtnActive]}
                onPress={() => setMode(mode === 'create' ? 'none' : 'create')}>
                <Text style={[styles.modeBtnText, mode === 'create' && styles.modeBtnTextActive]}>+ Create group</Text>
              </Pressable>
              <Pressable
                style={[styles.modeBtn, mode === 'join' && styles.modeBtnActive]}
                onPress={() => setMode(mode === 'join' ? 'none' : 'join')}>
                <Text style={[styles.modeBtnText, mode === 'join' && styles.modeBtnTextActive]}>Join with code</Text>
              </Pressable>
            </View>

            {mode === 'create' && (
              <View style={styles.createForm}>
                <View style={styles.createFormRow}>
                  <Pressable style={styles.pictureBtn} onPress={handlePickPicture}>
                    {picture ? (
                      <Image source={{ uri: picture.uri }} style={styles.pictureThumb} contentFit="cover" />
                    ) : (
                      <Text style={styles.pictureBtnText}>📷{'\n'}Photo</Text>
                    )}
                  </Pressable>
                  <View style={styles.createFormFields}>
                    <TextInput
                      style={styles.input}
                      placeholder="Group name"
                      placeholderTextColor={Colors.muted}
                      value={nameInput}
                      onChangeText={setNameInput}
                      maxLength={40}
                    />
                    <TextInput
                      style={styles.input}
                      placeholder="Location (optional), e.g. Austin, TX"
                      placeholderTextColor={Colors.muted}
                      value={locationInput}
                      onChangeText={setLocationInput}
                      maxLength={60}
                    />
                  </View>
                </View>
                <Pressable
                  style={[styles.submitBtn, styles.submitBtnFull, (submitting || !nameInput.trim()) && styles.btnDisabled]}
                  disabled={submitting || !nameInput.trim()}
                  onPress={handleCreate}>
                  <Text style={styles.submitBtnText}>{submitting ? 'Creating…' : 'Create group'}</Text>
                </Pressable>
              </View>
            )}

            {mode === 'join' && (
              <View style={styles.formRow}>
                <TextInput
                  style={styles.input}
                  placeholder="Invite code"
                  placeholderTextColor={Colors.muted}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  value={codeInput}
                  onChangeText={setCodeInput}
                  maxLength={8}
                />
                <Pressable style={styles.submitBtn} disabled={submitting || !codeInput.trim()} onPress={handleJoin}>
                  <Text style={styles.submitBtnText}>{submitting ? '…' : 'Join'}</Text>
                </Pressable>
              </View>
            )}

            {groups.length > 0 && <Text style={styles.sectionTitle}>Your groups</Text>}
          </View>
        }
        renderItem={({ item }) => (
          <GroupCard
            group={item}
            expanded={expandedId === item.id}
            detail={details[item.id]}
            detailLoading={detailLoading === item.id}
            onPress={() => toggleExpand(item.id)}
            token={token}
            show={show}
          />
        )}
        ListEmptyComponent={
          !loading ? (
            <Text style={styles.empty}>No groups yet. Create one or join with an invite code.</Text>
          ) : null
        }
      />
    </View>
  );
}

function GroupCard({
  group,
  expanded,
  detail,
  detailLoading,
  onPress,
  token,
  show,
}: {
  group: GroupRow;
  expanded: boolean;
  detail?: GroupDetail;
  detailLoading: boolean;
  onPress: () => void;
  token: string | null;
  show: (msg: string) => void;
}) {
  return (
    <View style={styles.card}>
      <Pressable onPress={onPress} style={styles.cardHead}>
        {group.pictureKey ? (
          <Image source={{ uri: photoUrl(group.pictureKey) }} style={styles.cardPicture} contentFit="cover" />
        ) : (
          <View style={styles.cardPicturePlaceholder}>
            <Text style={styles.cardPicturePlaceholderText}>{group.name.slice(0, 1).toUpperCase()}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.cardName}>{group.name}</Text>
          <Text style={styles.cardMeta}>
            {group.memberCount} member{group.memberCount === 1 ? '' : 's'} · code {group.inviteCode}
          </Text>
          {!!group.location && <Text style={styles.cardLocation}>📍 {group.location}</Text>}
        </View>
        <Text style={styles.cardChevron}>{expanded ? '︿' : '﹀'}</Text>
      </Pressable>

      {expanded && (
        <View style={styles.leaderboard}>
          {detailLoading && <Text style={styles.leaderboardLoading}>Loading…</Text>}
          {detail?.members.map((m, i) => (
            <View key={m.userId} style={styles.leaderRow}>
              <Text style={styles.leaderRank}>{i + 1}</Text>
              <Text style={styles.leaderName}>@{m.username}</Text>
              <Text style={styles.leaderCount}>{m.weeklyPosts > 0 ? `🔥 ${m.weeklyPosts}` : '—'}</Text>
            </View>
          ))}

          <PotsSection groupId={group.id} token={token} show={show} />
        </View>
      )}
    </View>
  );
}

function PotsSection({ groupId, token, show }: { groupId: string; token: string | null; show: (msg: string) => void }) {
  const [pots, setPots] = useState<PotSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [buyInInput, setBuyInInput] = useState('50');
  const [durationInput, setDurationInput] = useState('7');
  const [thresholdInput, setThresholdInput] = useState('3');
  const [splitMethod, setSplitMethod] = useState<'even' | 'weighted'>('even');
  const [expandedPotId, setExpandedPotId] = useState<string | null>(null);
  const [potDetails, setPotDetails] = useState<Record<string, PotDetail>>({});
  const [potDetailLoading, setPotDetailLoading] = useState<string | null>(null);

  const loadPots = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/groups/${groupId}/pots`, { token });
      const data = (await res.json()) as { pots?: PotSummary[] };
      setPots(data.pots ?? []);
    } finally {
      setLoading(false);
    }
  }, [groupId, token]);

  useEffect(() => {
    loadPots();
  }, [loadPots]);

  const handleCreatePot = async () => {
    const buyIn = parseInt(buyInInput, 10);
    const durationDays = parseInt(durationInput, 10);
    const thresholdCount = parseInt(thresholdInput, 10);
    if (!buyIn || buyIn <= 0) return show('Buy-in must be a positive number of tokens.');
    if (!durationDays || durationDays < MIN_POT_DAYS || durationDays > MAX_POT_DAYS) {
      return show(`Duration must be between ${MIN_POT_DAYS} and ${MAX_POT_DAYS} days.`);
    }
    if (!thresholdCount || thresholdCount <= 0) return show('Threshold must be a positive number of posts.');

    setSubmitting(true);
    try {
      const res = await apiFetch(`/groups/${groupId}/pots`, {
        method: 'POST',
        token,
        body: { buyIn, durationDays, thresholdCount, splitMethod },
      });
      const data = (await res.json()) as { pot?: unknown; error?: string };
      if (!res.ok || !data.pot) {
        show(data.error ?? "Couldn't start that pot.");
        return;
      }
      show(`🪙 Pot started: ${buyIn} tokens to buy in`);
      setCreating(false);
      loadPots();
    } finally {
      setSubmitting(false);
    }
  };

  const handleJoinPot = async (potId: string) => {
    const res = await apiFetch(`/pots/${potId}/join`, { method: 'POST', token });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      show(data.error ?? "Couldn't join that pot.");
      return;
    }
    show('🪙 Staked. Good luck!');
    loadPots();
  };

  const togglePotExpand = async (potId: string) => {
    if (expandedPotId === potId) {
      setExpandedPotId(null);
      return;
    }
    setExpandedPotId(potId);
    setPotDetailLoading(potId);
    try {
      const res = await apiFetch(`/pots/${potId}`, { token });
      const data = (await res.json()) as { pot?: PotDetail };
      if (data.pot) setPotDetails((prev) => ({ ...prev, [potId]: data.pot! }));
    } finally {
      setPotDetailLoading(null);
    }
  };

  return (
    <View style={styles.potsSection}>
      <View style={styles.potsHead}>
        <Text style={styles.potsTitle}>Pots</Text>
        <Pressable onPress={() => setCreating((c) => !c)}>
          <Text style={styles.potsNewBtn}>{creating ? 'Cancel' : '+ New pot'}</Text>
        </Pressable>
      </View>

      {creating && (
        <View style={styles.potForm}>
          <View style={styles.potFormRow}>
            <View style={styles.potFormField}>
              <Text style={styles.potFormLabel}>Buy-in (🪙)</Text>
              <TextInput
                style={styles.potInput}
                keyboardType="number-pad"
                value={buyInInput}
                onChangeText={setBuyInInput}
              />
            </View>
            <View style={styles.potFormField}>
              <Text style={styles.potFormLabel}>Days ({MIN_POT_DAYS}-{MAX_POT_DAYS})</Text>
              <TextInput
                style={styles.potInput}
                keyboardType="number-pad"
                value={durationInput}
                onChangeText={setDurationInput}
              />
            </View>
            <View style={styles.potFormField}>
              <Text style={styles.potFormLabel}>Posts to qualify</Text>
              <TextInput
                style={styles.potInput}
                keyboardType="number-pad"
                value={thresholdInput}
                onChangeText={setThresholdInput}
              />
            </View>
          </View>

          <Text style={styles.potFormLabel}>If someone misses the bar, their stake goes to:</Text>
          <View style={styles.modeRow}>
            <Pressable
              style={[styles.modeBtn, splitMethod === 'even' && styles.modeBtnActive]}
              onPress={() => setSplitMethod('even')}>
              <Text style={[styles.modeBtnText, splitMethod === 'even' && styles.modeBtnTextActive]}>Split evenly</Text>
            </Pressable>
            <Pressable
              style={[styles.modeBtn, splitMethod === 'weighted' && styles.modeBtnActive]}
              onPress={() => setSplitMethod('weighted')}>
              <Text style={[styles.modeBtnText, splitMethod === 'weighted' && styles.modeBtnTextActive]}>
                Weighted by activity
              </Text>
            </Pressable>
          </View>

          <Pressable
            style={[styles.submitBtn, styles.submitBtnFull, submitting && styles.btnDisabled]}
            disabled={submitting}
            onPress={handleCreatePot}>
            <Text style={styles.submitBtnText}>{submitting ? 'Starting…' : 'Start pot'}</Text>
          </Pressable>
        </View>
      )}

      {loading && <Text style={styles.leaderboardLoading}>Loading pots…</Text>}
      {!loading && pots.length === 0 && !creating && <Text style={styles.potsEmpty}>No pots yet.</Text>}

      {pots.map((pot) => (
        <View key={pot.id} style={styles.potRow}>
          <Pressable onPress={() => togglePotExpand(pot.id)} style={styles.potRowHead}>
            <View style={{ flex: 1 }}>
              <Text style={styles.potRowTitle}>
                🪙 {pot.buyIn} buy-in · {pot.entryCount} in · {pot.totalTokens} pot
              </Text>
              <Text style={styles.potRowMeta}>
                {pot.status === 'open' ? daysLeft(pot.endsAt) : 'Resolved'} · needs {pot.thresholdCount} posts ·{' '}
                {pot.splitMethod === 'even' ? 'even split' : 'weighted split'}
              </Text>
            </View>
            {pot.status === 'open' && !pot.joined && (
              <Pressable style={styles.potJoinBtn} onPress={() => handleJoinPot(pot.id)}>
                <Text style={styles.potJoinBtnText}>Join</Text>
              </Pressable>
            )}
            {pot.joined && <Text style={styles.potJoinedTag}>In</Text>}
          </Pressable>

          {expandedPotId === pot.id && (
            <View style={styles.potEntries}>
              {potDetailLoading === pot.id && <Text style={styles.leaderboardLoading}>Loading…</Text>}
              {potDetails[pot.id]?.entries.map((e) => (
                <View key={e.userId} style={styles.leaderRow}>
                  <Text style={styles.leaderName}>@{e.username}</Text>
                  <Text style={styles.potEntryCount}>
                    {e.postCount}/{pot.thresholdCount} posts
                  </Text>
                  {e.qualified !== null && (
                    <Text style={e.qualified ? styles.potEntryWin : styles.potEntryLoss}>
                      {e.qualified ? `+${e.payout}` : 'forfeited'}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bg },
  content: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.six },
  pageTitle: { fontSize: 26, fontWeight: '800', color: Colors.ink, marginBottom: 6 },
  pageDesc: { color: Colors.muted, fontSize: 13.5, lineHeight: 18, marginBottom: Spacing.three },
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: Spacing.two + 2 },
  modeBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: Radius.sm,
    backgroundColor: Colors.card,
    borderWidth: 1.5,
    borderColor: Colors.line,
  },
  modeBtnActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  modeBtnText: { fontWeight: '800', fontSize: 13, color: Colors.muted },
  modeBtnTextActive: { color: '#fff' },
  formRow: { flexDirection: 'row', gap: 8, marginBottom: Spacing.three },
  createForm: { gap: Spacing.two, marginBottom: Spacing.three },
  createFormRow: { flexDirection: 'row', gap: 10 },
  createFormFields: { flex: 1, gap: 8 },
  pictureBtn: {
    width: 72,
    height: 72,
    borderRadius: Radius.sm,
    backgroundColor: Colors.card,
    borderWidth: 1.5,
    borderColor: Colors.line,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  pictureBtnText: { fontSize: 11, fontWeight: '700', color: Colors.muted, textAlign: 'center' },
  pictureThumb: { width: '100%', height: '100%' },
  input: {
    flex: 1,
    backgroundColor: Colors.card,
    borderWidth: 1.5,
    borderColor: Colors.line,
    borderRadius: Radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: Colors.ink,
  },
  submitBtn: { backgroundColor: Colors.accent, borderRadius: Radius.sm, paddingHorizontal: 18, justifyContent: 'center' },
  submitBtnFull: { paddingVertical: 13, alignItems: 'center' },
  btnDisabled: { opacity: 0.5 },
  submitBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: Colors.muted, marginBottom: Spacing.two },
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.card,
    marginBottom: Spacing.two + 2,
    overflow: 'hidden',
    ...Shadow,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two + 2, padding: Spacing.three },
  cardPicture: { width: 44, height: 44, borderRadius: Radius.sm, backgroundColor: Colors.bg },
  cardPicturePlaceholder: {
    width: 44,
    height: 44,
    borderRadius: Radius.sm,
    backgroundColor: Colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardPicturePlaceholderText: { fontSize: 17, fontWeight: '800', color: Colors.accent },
  cardName: { fontWeight: '800', fontSize: 15.5, color: Colors.ink },
  cardMeta: { fontSize: 12, color: Colors.muted, marginTop: 2 },
  cardLocation: { fontSize: 11.5, color: Colors.muted, marginTop: 2 },
  cardChevron: { fontSize: 14, color: Colors.muted, marginLeft: 8 },
  leaderboard: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.two + 2, gap: 6 },
  leaderboardLoading: { color: Colors.muted, fontSize: 12.5, paddingVertical: 6 },
  leaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  leaderRank: { width: 16, fontSize: 12.5, fontWeight: '800', color: Colors.muted },
  leaderName: { flex: 1, fontSize: 13.5, fontWeight: '700', color: Colors.ink },
  leaderCount: { fontSize: 12.5, fontWeight: '800', color: Colors.accent },
  empty: { textAlign: 'center', color: Colors.muted, paddingVertical: 40 },

  potsSection: { marginTop: Spacing.two + 2, paddingTop: Spacing.two + 2, borderTopWidth: 1, borderTopColor: Colors.line, gap: 8 },
  potsHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  potsTitle: { fontSize: 13, fontWeight: '800', color: Colors.muted },
  potsNewBtn: { fontSize: 12.5, fontWeight: '800', color: Colors.accent },
  potsEmpty: { fontSize: 12.5, color: Colors.muted, paddingVertical: 4 },
  potForm: { backgroundColor: Colors.bg, borderRadius: Radius.sm, padding: Spacing.two + 2, gap: 8 },
  potFormRow: { flexDirection: 'row', gap: 8 },
  potFormField: { flex: 1, gap: 3 },
  potFormLabel: { fontSize: 10.5, fontWeight: '800', color: Colors.muted },
  potInput: {
    backgroundColor: Colors.card,
    borderWidth: 1.5,
    borderColor: Colors.line,
    borderRadius: Radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 14,
    color: Colors.ink,
  },
  potRow: { backgroundColor: Colors.bg, borderRadius: Radius.sm, marginTop: 2, overflow: 'hidden' },
  potRowHead: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: Spacing.two + 2 },
  potRowTitle: { fontSize: 13, fontWeight: '800', color: Colors.ink },
  potRowMeta: { fontSize: 11, color: Colors.muted, marginTop: 2 },
  potJoinBtn: { backgroundColor: Colors.accent, borderRadius: Radius.pill, paddingHorizontal: 14, paddingVertical: 7 },
  potJoinBtnText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  potJoinedTag: { fontSize: 11.5, fontWeight: '800', color: Colors.green },
  potEntries: { paddingHorizontal: Spacing.two + 2, paddingBottom: Spacing.two + 2, gap: 4 },
  potEntryCount: { fontSize: 11.5, color: Colors.muted, fontWeight: '700' },
  potEntryWin: { fontSize: 12, fontWeight: '800', color: Colors.green, marginLeft: 8 },
  potEntryLoss: { fontSize: 12, fontWeight: '800', color: Colors.red, marginLeft: 8 },
});
