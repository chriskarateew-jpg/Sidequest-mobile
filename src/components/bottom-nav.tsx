import { LinearGradient } from 'expo-linear-gradient';
import type { Href } from 'expo-router';
import { router } from 'expo-router';
import type { ComponentType } from 'react';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FriendsIcon, GroupsIcon, ProfileIcon, RewardsIcon, TasksIcon } from '@/components/rail-icons';
import { Colors, Radius, Shadow, Spacing } from '@/constants/theme';
import { useGumpaStore } from '@/lib/store';

// Height of the bar's own content, excluding the device's bottom safe-area
// inset — screens add insets.bottom on top of this to size their scroll
// clearance correctly.
export const TAB_BAR_HEIGHT = 62;

// The feed is the app's home screen ("/") — no tab needed to return to
// where you already are.
const TAB_ITEMS: { href: Href; Icon: ComponentType<{ size?: number; color?: string }>; label: string }[] = [
  { href: '/quests', Icon: TasksIcon, label: 'Tasks' },
  { href: '/friends', Icon: FriendsIcon, label: 'Friends' },
  { href: '/groups', Icon: GroupsIcon, label: 'Groups' },
  { href: '/rewards', Icon: RewardsIcon, label: 'Rewards' },
  { href: '/profile', Icon: ProfileIcon, label: 'Profile' },
];

// Fixed to the bottom of the screen so it stays put while the screen's own
// content scrolls above it.
export function BottomNav() {
  const insets = useSafeAreaInsets();
  // Calling the selector (not just reading the store's function reference)
  // is what makes this reactive — zustand re-runs the selector on every
  // state change and only re-renders when the returned boolean flips, so
  // completing the last old-period task or revisiting Tasks (which calls
  // markQuestsSeen) clears the badge immediately.
  const hasNewTasks = useGumpaStore((s) => s.hasNewTasks());

  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom + Spacing.two }]}>
      {TAB_ITEMS.map((item) => (
        <TabButton
          key={item.label}
          href={item.href}
          Icon={item.Icon}
          label={item.label}
          showNewBadge={item.href === '/quests' && hasNewTasks}
        />
      ))}
    </View>
  );
}

function TabButton({
  href,
  Icon,
  label,
  showNewBadge,
}: {
  href: Href;
  Icon: ComponentType<{ size?: number; color?: string }>;
  label: string;
  showNewBadge?: boolean;
}) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePress = () => {
    scale.value = withSequence(withTiming(0.8, { duration: 90 }), withTiming(1, { duration: 140 }));
    setTimeout(() => router.push(href), 90);
  };

  return (
    <Pressable testID={`nav-${label.toLowerCase()}`} onPress={handlePress} hitSlop={6} style={styles.item}>
      <Animated.View style={style}>
        <View>
          <LinearGradient colors={[Colors.accent, Colors.accent2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.button}>
            <Icon size={17} color="#fff" />
          </LinearGradient>
          {showNewBadge && <NewBadge />}
        </View>
      </Animated.View>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

// Draws attention to a cadence rollover (new daily/weekly/monthly tasks are
// ready) via a small pulsing pill in the button's corner — cleared by
// markQuestsSeen the moment the Tasks tab is opened (see quests.tsx).
function NewBadge() {
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(withSequence(withTiming(1.18, { duration: 550 }), withTiming(1, { duration: 550 })), -1, true);
  }, [pulse]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  return (
    <Animated.View style={[styles.newBadge, style]}>
      <Text style={styles.newBadgeText}>New!</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: Spacing.two,
    backgroundColor: Colors.card,
    borderTopWidth: 1,
    borderTopColor: Colors.line,
  },
  item: { flex: 1, alignItems: 'center' },
  newBadge: {
    position: 'absolute',
    top: -7,
    right: -12,
    backgroundColor: Colors.red,
    borderRadius: Radius.pill,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderWidth: 1.5,
    borderColor: Colors.card,
  },
  newBadgeText: { fontSize: 8, fontWeight: '800', color: '#fff' },
  button: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow,
  },
  label: { fontSize: 8.5, fontWeight: '800', color: Colors.muted, marginTop: 3, textAlign: 'center' },
});
