import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackButton } from '@/components/back-button';
import { ChallengeCard } from '@/components/challenge-card';
import { CheckBadgeIcon } from '@/components/rail-icons';
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
  const [taskFilter, setTaskFilter] = useState<Cadence | 'all'>('all');

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
