// Gumpa — create a temporary token-payout boost for any challenge (static,
// local, custom Task, or time-boxed Challenge). Reached only from the
// hidden /dev panel; server-side requireDeveloper is the actual gate (see
// server/src/boosts.ts).

import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackButton } from '@/components/back-button';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { createAdminBoost, fetchAdminTimedChallenges } from '@/lib/admin-api';
import { useAuthStore } from '@/lib/auth';
import { CHALLENGES } from '@/lib/data';
import { useGumpaStore } from '@/lib/store';
import { useToastStore } from '@/lib/toast';

const DURATION_PRESETS: { label: string; hours: number }[] = [
  { label: '1h', hours: 1 },
  { label: '24h', hours: 24 },
  { label: '1 week', hours: 24 * 7 },
  { label: '30 days', hours: 24 * 30 },
];

interface BoostTarget {
  id: string;
  title: string;
  tokens: number;
  subtitle: string;
}

export default function DevBoostFormScreen() {
  const insets = useSafeAreaInsets();
  const token = useAuthStore((s) => s.token);
  const show = useToastStore((s) => s.show);
  const customChallenges = useGumpaStore((s) => s.customChallenges);
  const localChallenges = useGumpaStore((s) => s.localChallenges);
  const [timedTargets, setTimedTargets] = useState<BoostTarget[]>([]);

  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [boostedTokens, setBoostedTokens] = useState('');
  const [durationHours, setDurationHours] = useState('24');
  const [saving, setSaving] = useState(false);

  // Side-effect-free admin listing (not the user-facing GET
  // /timed-challenges, which would assign it to the caller) — just for
  // populating this picker with time-boxed Challenges too.
  useEffect(() => {
    if (!token) return;
    fetchAdminTimedChallenges(token).then((result) => {
      if (result.ok) {
        setTimedTargets(result.data.challenges.map((c) => ({ id: c.id, title: c.title, tokens: c.tokens, subtitle: 'timed challenge' })));
      }
    });
  }, [token]);

  // Every challenge id the developer's own device currently knows about —
  // local challenges are region-specific and only exist for whoever's near
  // that spot, but boosting one is still valid, just narrow in effect.
  const allTargets: BoostTarget[] = useMemo(
    () => [
      ...CHALLENGES.map((c) => ({ id: c.id, title: c.title, tokens: c.tokens, subtitle: c.cadence })),
      ...customChallenges.map((c) => ({ id: c.id, title: c.title, tokens: c.tokens, subtitle: c.cadence })),
      ...localChallenges.map((c) => ({ id: c.id, title: c.title, tokens: c.tokens, subtitle: c.cadence })),
      ...timedTargets,
    ],
    [customChallenges, localChallenges, timedTargets]
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allTargets;
    return allTargets.filter((c) => c.title.toLowerCase().includes(q) || c.id.toLowerCase().includes(q));
  }, [allTargets, query]);

  const selected = allTargets.find((c) => c.id === selectedId) ?? null;

  const handleSave = async () => {
    if (!token || !selectedId) return;
    const tokensNum = Number(boostedTokens);
    const hoursNum = Number(durationHours);
    if (!Number.isInteger(tokensNum) || tokensNum <= 0) {
      show('Boosted tokens must be a positive whole number.');
      return;
    }
    if (!Number.isFinite(hoursNum) || hoursNum <= 0) {
      show('Duration must be a positive number of hours.');
      return;
    }

    setSaving(true);
    const result = await createAdminBoost(token, { challengeId: selectedId, boostedTokens: tokensNum, durationHours: hoursNum });
    setSaving(false);
    if (!result.ok) {
      show(result.message);
      return;
    }
    router.back();
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.two }]}>
      <BackButton />
      <Text style={styles.pageTitle}>New boost</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Target challenge</Text>
        {selected ? (
          <Pressable style={styles.selectedRow} onPress={() => setSelectedId(null)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{selected.title}</Text>
              <Text style={styles.rowDesc}>
                +{selected.tokens} · {selected.subtitle}
              </Text>
            </View>
            <Text style={styles.changeText}>Change</Text>
          </Pressable>
        ) : (
          <>
            <TextInput
              style={styles.input}
              value={query}
              onChangeText={setQuery}
              placeholder="Search by title…"
              placeholderTextColor={Colors.muted}
            />
            <View style={styles.list}>
              {filtered.slice(0, 30).map((c) => (
                <Pressable key={c.id} style={styles.listRow} onPress={() => setSelectedId(c.id)}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {c.title}
                  </Text>
                  <Text style={styles.rowDesc}>
                    +{c.tokens} · {c.subtitle}
                  </Text>
                </Pressable>
              ))}
              {filtered.length === 0 && <Text style={styles.emptyText}>No matching challenges.</Text>}
            </View>
          </>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>New token payout</Text>
        <TextInput
          style={styles.input}
          value={boostedTokens}
          onChangeText={setBoostedTokens}
          placeholder={selected ? String(selected.tokens) : '50'}
          placeholderTextColor={Colors.muted}
          keyboardType="number-pad"
        />

        <Text style={styles.label}>Duration</Text>
        <View style={styles.presetRow}>
          {DURATION_PRESETS.map((p) => (
            <Pressable key={p.label} style={styles.preset} onPress={() => setDurationHours(String(p.hours))}>
              <Text style={styles.presetText}>{p.label}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          style={styles.input}
          value={durationHours}
          onChangeText={setDurationHours}
          placeholder="Hours"
          placeholderTextColor={Colors.muted}
          keyboardType="number-pad"
        />
      </View>

      <Pressable style={[styles.saveBtn, (!selectedId || saving) && styles.saveBtnDisabled]} onPress={handleSave} disabled={!selectedId || saving}>
        <Text style={styles.saveBtnText}>{saving ? 'Starting…' : 'Start boost'}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.three, paddingBottom: Spacing.six },
  pageTitle: { fontSize: 24, fontWeight: '800', color: Colors.ink, marginBottom: Spacing.three },
  card: { backgroundColor: Colors.card, borderRadius: Radius.card, padding: Spacing.three, gap: 6, marginBottom: Spacing.four },
  label: { fontSize: 11, fontWeight: '800', color: Colors.muted, letterSpacing: 0.4, marginTop: 6 },
  input: {
    backgroundColor: Colors.bg,
    borderWidth: 1.5,
    borderColor: Colors.line,
    borderRadius: Radius.sm,
    padding: 12,
    fontSize: 14.5,
    color: Colors.ink,
  },
  list: { maxHeight: 260, marginTop: 4 },
  listRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.line },
  selectedRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.accentSoft, borderRadius: Radius.sm, padding: 12, marginTop: 4 },
  rowTitle: { fontSize: 14, fontWeight: '800', color: Colors.ink },
  rowDesc: { fontSize: 12, color: Colors.muted, marginTop: 2 },
  changeText: { color: Colors.accent, fontWeight: '800', fontSize: 12.5 },
  emptyText: { color: Colors.muted, fontSize: 13, paddingVertical: 8 },
  presetRow: { flexDirection: 'row', gap: 8, marginTop: 4, marginBottom: 8 },
  preset: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.sm, backgroundColor: Colors.bg, borderWidth: 1.5, borderColor: Colors.line },
  presetText: { fontSize: 12.5, fontWeight: '700', color: Colors.muted },
  saveBtn: { backgroundColor: Colors.accent, borderRadius: Radius.sm, paddingVertical: 14, alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
