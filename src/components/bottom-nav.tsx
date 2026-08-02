import { LinearGradient } from 'expo-linear-gradient';
import type { Href } from 'expo-router';
import { router } from 'expo-router';
import type { ComponentType } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FriendsIcon, GroupsIcon, ProfileIcon, RewardsIcon, TasksIcon } from '@/components/rail-icons';
import { Colors, Shadow, Spacing } from '@/constants/theme';

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

  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom + Spacing.two }]}>
      {TAB_ITEMS.map((item) => (
        <TabButton key={item.label} href={item.href} Icon={item.Icon} label={item.label} />
      ))}
    </View>
  );
}

function TabButton({
  href,
  Icon,
  label,
}: {
  href: Href;
  Icon: ComponentType<{ size?: number; color?: string }>;
  label: string;
}) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePress = () => {
    scale.value = withSequence(withTiming(0.8, { duration: 90 }), withTiming(1, { duration: 140 }));
    setTimeout(() => router.push(href), 90);
  };

  return (
    <Pressable onPress={handlePress} hitSlop={6} style={styles.item}>
      <Animated.View style={style}>
        <LinearGradient colors={[Colors.accent, Colors.accent2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.button}>
          <Icon size={17} color="#fff" />
        </LinearGradient>
      </Animated.View>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
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
