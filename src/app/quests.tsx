import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackButton } from '@/components/back-button';
import { ChallengeCard } from '@/components/challenge-card';
import { CheckBadgeIcon } from '@/components/rail-icons';
import { TimedChallengeCard } from '@/components/timed-challenge-card';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { type Cadence } from '@/lib/data';
import { useGumpaStore } from '@/lib/store';

const CADENCE_FILTERS: { id: Cadence | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
];

export default function QuestsScreen() {
  const insets = useSafeAreaInsets();
  const xp = useGumpaStore((s) => s.xp);
  const getSuggestions = useGumpaStore((s) => s.getSuggestions);
  const markQuestsSeen = useGumpaStore((s) => s.markQuestsSeen);
  const timedChallenges = useGumpaStore((s) => s.timedChallenges);
  const refreshTimedChallenges = useGumpaStore((s) => s.refreshTimedChallenges);
  const [taskFilter, setTaskFilter] = useState<Cadence | 'all'>('all');

  // Clears the bottom nav's "New!" badge every time this tab gains focus,
  // not just on first mount — native-stack keeps pushed screens alive in
  // the background, so a plain mount-only effect would miss a same-period
  // revisit after the badge was already cleared once and re-armed later.
  // Also force-refreshes timed Challenges on every focus — their TTL is
  // short (60s, see store.ts) precisely so reopening this tab reliably
  // shows an up-to-date countdown/list rather than waiting on the TTL.
  useFocusEffect(
    useCallback(() => {
      markQuestsSeen();
      refreshTimedChallenges(true);
    }, [markQuestsSeen, refreshTimedChallenges])
  );

  // Belt-and-suspenders on top of the server's own filtering (GET
  // /timed-challenges already excludes expired/completed ones) — avoids a
  // stale "still live" card lingering for up to a full TTL window after its
  // deadline actually passes.
  const liveTimedChallenges = useMemo(() => timedChallenges.filter((c) => c.deadlineAt > Date.now()), [timedChallenges]);

  // recomputed whenever xp changes (every completion)
  const sugg = useMemo(() => getSuggestions(), [getSuggestions, xp]);

  const assignments = useMemo(() => {
    if (taskFilter === 'all') return [...sugg.daily, ...sugg.weekly, ...sugg.monthly];
    return sugg[taskFilter];
  }, [sugg, taskFilter]);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.two }]}>
        <BackButton />
        <View style={styles.pageHead}>
          <Text style={styles.pageTitle}>Tasks</Text>
          <Pressable onPress={() => router.push('/completed')} style={styles.completedBtn} hitSlop={8}>
            <CheckBadgeIcon size={15} color={Colors.accent} />
            <Text style={styles.completedBtnText}>Completed</Text>
          </Pressable>
        </View>

        {liveTimedChallenges.length > 0 && (
          <View style={styles.liveSection}>
            <Text style={styles.liveSectionTitle}>Live Challenges</Text>
            <View style={styles.sectionList}>
              {liveTimedChallenges.map((c) => (
                <TimedChallengeCard key={c.id} challenge={c} />
              ))}
            </View>
          </View>
        )}

        <FilterRow options={CADENCE_FILTERS} active={taskFilter} onChange={setTaskFilter} />

        {assignments.length > 0 ? (
          <View style={styles.sectionList}>
            {assignments.map((c) => (
              <ChallengeCard key={c.id} challenge={c} />
            ))}
          </View>
        ) : (
          <Text style={styles.empty}>
            {taskFilter === 'all' ? 'No tasks assigned right now.' : `No ${taskFilter} tasks assigned right now.`}
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

function FilterRow({
  options,
  active,
  onChange,
}: {
  options: { id: Cadence | 'all'; label: string }[];
  active: Cadence | 'all';
  onChange: (id: Cadence | 'all') => void;
}) {
  return (
    <View style={styles.filterRow}>
      {options.map((opt) => {
        const isActive = opt.id === active;
        return (
          <Pressable
            key={opt.id}
            onPress={() => onChange(opt.id)}
            style={[styles.filterBtn, isActive && styles.filterBtnActive]}>
            <Text style={[styles.filterBtnText, isActive && styles.filterBtnTextActive]}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.three, paddingBottom: Spacing.six },
  pageHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.four },
  pageTitle: { fontSize: 26, fontWeight: '800', color: Colors.ink },
  completedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: Colors.accentSoft,
    backgroundColor: Colors.accentSoft,
    borderRadius: Radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  completedBtnText: { fontSize: 13, fontWeight: '800', color: Colors.accent },
  liveSection: { marginBottom: Spacing.four },
  liveSectionTitle: { fontSize: 12, fontWeight: '800', color: Colors.red, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 },
  sectionList: { gap: Spacing.two + 2 },
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
  empty: { textAlign: 'center', color: Colors.muted, paddingVertical: 40 },
});
