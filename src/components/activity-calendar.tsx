// Gumpa — a "which days did I do something" month grid for Profile.
// Inspired by Strava's activity calendar in spirit, deliberately not a
// copy: circular day markers instead of square heatmap cells, a two-tier
// brand-blue intensity instead of a green gradient, and built entirely
// from data the app already fetches — GET /posts/mine (see
// src/lib/posts.ts's fetchMyPosts) already returns every completed task
// with a createdAt timestamp, so no new backend endpoint was needed for
// this (see docs/gumpa-plus-perks-roadmap.md Phase 3).
//
// Fixed to the current calendar month for now — a swipeable/paged version
// across past months was considered and deliberately deferred, see the
// roadmap doc's Phase 3 notes.

import { StyleSheet, Text, View } from 'react-native';

import { Colors, Radius } from '@/constants/theme';
import type { MyPost } from '@/lib/posts';

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const CELL_SIZE = 34;

export function ActivityCalendar({ posts }: { posts: MyPost[] }) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const today = now.getDate();

  // Grouped by local calendar day (not UTC) — this is about how the user
  // themselves would describe "which day," same reasoning as any
  // personal activity log, distinct from the server's UTC period keys
  // used elsewhere for daily/weekly/monthly cadence resets.
  const countsByDay = new Map<number, number>();
  for (const post of posts) {
    const d = new Date(post.createdAt);
    if (d.getFullYear() === year && d.getMonth() === month) {
      countsByDay.set(d.getDate(), (countsByDay.get(d.getDate()) ?? 0) + 1);
    }
  }

  const firstWeekday = new Date(year, month, 1).getDay(); // 0 = Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  const activeDays = countsByDay.size;
  const monthLabel = now.toLocaleDateString(undefined, { month: 'long' });

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{monthLabel}</Text>
        <Text style={styles.subtitle}>
          {activeDays} active {activeDays === 1 ? 'day' : 'days'}
        </Text>
      </View>

      <View style={styles.weekdayRow}>
        {WEEKDAY_LABELS.map((label, i) => (
          <Text key={i} style={styles.weekdayLabel}>
            {label}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((day, i) => {
          if (day == null) return <View key={i} style={styles.cell} />;
          const count = countsByDay.get(day) ?? 0;
          return (
            <View key={i} style={styles.cell}>
              <View style={[styles.dayCircle, count === 1 && styles.dayCircleSoft, count >= 2 && styles.dayCircleSolid]}>
                <Text style={[styles.dayNumber, count === 1 && styles.dayNumberSoft, count >= 2 && styles.dayNumberSolid]}>
                  {day}
                </Text>
              </View>
              {day === today && <View style={styles.todayDot} />}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: Colors.card, borderRadius: Radius.card, padding: 16, marginBottom: 16 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 },
  title: { fontSize: 15, fontWeight: '800', color: Colors.ink },
  subtitle: { fontSize: 11.5, fontWeight: '700', color: Colors.muted },
  weekdayRow: { flexDirection: 'row', marginBottom: 2 },
  weekdayLabel: { flex: 1, textAlign: 'center', fontSize: 10, fontWeight: '800', color: Colors.muted },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, alignItems: 'center', justifyContent: 'center', paddingVertical: 3 },
  dayCircle: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    borderRadius: CELL_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.line,
  },
  dayCircleSoft: { backgroundColor: Colors.accentSoft, borderColor: Colors.accentSoft },
  dayCircleSolid: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  dayNumber: { fontSize: 12, fontWeight: '700', color: Colors.muted },
  dayNumberSoft: { color: Colors.accent, fontWeight: '800' },
  dayNumberSolid: { color: '#fff', fontWeight: '800' },
  // A small dot beneath the circle marks "today" regardless of fill state
  // (a border ring would blend into dayCircleSolid's own accent-colored
  // border on a heavy-activity today).
  todayDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.accent, marginTop: 3 },
});
