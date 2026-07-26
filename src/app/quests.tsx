import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackButton } from '@/components/back-button';
import { CADENCE_LABEL, ChallengeCard } from '@/components/challenge-card';
import { Colors, Radius, Shadow, Spacing } from '@/constants/theme';
import { type Cadence, type Challenge } from '@/lib/data';
import { findChallengeById, useSidequestStore } from '@/lib/store';

const CADENCE_FILTERS: { id: Cadence | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function formatDate(ts: number) {
  const d = new Date(ts);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

interface CompletedEntry {
  challenge: Challenge;
  completedAt: number;
}

export default function QuestsScreen() {
  const insets = useSafeAreaInsets();
  const completions = useSidequestStore((s) => s.completions);
  const xp = useSidequestStore((s) => s.xp);
  const getSuggestions = useSidequestStore((s) => s.getSuggestions);
  const [cadence, setCadence] = useState<Cadence | 'all'>('all');

  // recomputed whenever xp changes (every completion)
  const sugg = useMemo(() => getSuggestions(), [getSuggestions, xp]);

  const completedList = useMemo(() => {
    const entries: CompletedEntry[] = Object.entries(completions)
      .filter(([, completion]) => completion.status === 'complete')
      .map(([key, completion]) => {
        const id = key.split(':')[0];
        const challenge = findChallengeById(id);
        return challenge ? { challenge, completedAt: completion.at } : null;
      })
      .filter((e): e is CompletedEntry => e !== null)
      .filter((e) => cadence === 'all' || e.challenge.cadence === cadence);

    return entries.sort((a, b) => b.completedAt - a.completedAt);
  }, [completions, cadence]);

  return (
    <View style={styles.screen}>
      <FlatList
        data={completedList}
        keyExtractor={(e) => `${e.challenge.id}:${e.completedAt}`}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.two }]}
        ListHeaderComponent={
          <View>
            <BackButton />
            <View style={styles.pageHead}>
              <Text style={styles.pageTitle}>Tasks</Text>
            </View>

            <AssignmentSection title="Today" challenges={sugg.daily} />
            <AssignmentSection title="This week" challenges={sugg.weekly} />
            <AssignmentSection title="This month" challenges={sugg.monthly} />

            <Text style={styles.completedHeading}>Completed</Text>
            <View style={styles.filterRow}>
              {CADENCE_FILTERS.map((opt) => {
                const active = opt.id === cadence;
                return (
                  <Pressable
                    key={opt.id}
                    onPress={() => setCadence(opt.id)}
                    style={[styles.filterBtn, active && styles.filterBtnActive]}>
                    <Text style={[styles.filterBtnText, active && styles.filterBtnTextActive]}>{opt.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.cardWrap}>
            <CompletedCard entry={item} />
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>No completed quests yet — finish today's assignment to see it here.</Text>
        }
      />
    </View>
  );
}

function AssignmentSection({ title, challenges }: { title: string; challenges: Challenge[] }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionList}>
        {challenges.map((c) => (
          <ChallengeCard key={c.id} challenge={c} />
        ))}
      </View>
    </View>
  );
}

function CompletedCard({ entry }: { entry: CompletedEntry }) {
  const { challenge, completedAt } = entry;
  return (
    <View style={styles.card}>
      <Text style={styles.cadence}>{CADENCE_LABEL[challenge.cadence]}</Text>
      <Text style={styles.title}>{challenge.title}</Text>
      <View style={styles.cardBottom}>
        <Text style={styles.reward}>+{challenge.tokens} 🪙</Text>
        <Text style={styles.doneLabel}>✓ {formatDate(completedAt)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.three, paddingBottom: Spacing.six },
  pageHead: { marginBottom: Spacing.four },
  pageTitle: { fontSize: 26, fontWeight: '800', color: Colors.ink },
  section: { marginBottom: Spacing.four },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: Colors.muted, letterSpacing: 0.3, marginBottom: Spacing.two + 2 },
  sectionList: { gap: Spacing.two + 2 },
  completedHeading: { fontSize: 18, fontWeight: '800', color: Colors.ink, marginBottom: Spacing.two + 2 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: Spacing.two + 2 },
  filterBtn: {
    borderWidth: 1.5,
    borderColor: Colors.line,
    backgroundColor: Colors.card,
    borderRadius: Radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  filterBtnActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  filterBtnText: { fontSize: 13, fontWeight: '700', color: Colors.muted },
  filterBtnTextActive: { color: '#fff' },
  cardWrap: { marginBottom: Spacing.two + 2 },
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.card,
    padding: Spacing.three + 4,
    gap: Spacing.two,
    ...Shadow,
  },
  cadence: { fontSize: 10.5, fontWeight: '800', color: Colors.muted, letterSpacing: 0.5 },
  title: { fontSize: 16, fontWeight: '800', color: Colors.ink, lineHeight: 21 },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  reward: { fontWeight: '800', color: Colors.gold, fontSize: 14 },
  doneLabel: { color: Colors.green, fontWeight: '800', fontSize: 13.5 },
  empty: { textAlign: 'center', color: Colors.muted, paddingVertical: 40 },
});
