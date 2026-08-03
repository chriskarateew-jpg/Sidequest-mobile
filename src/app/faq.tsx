import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackButton } from '@/components/back-button';
import { ChevronDownIcon } from '@/components/rail-icons';
import { Colors, Radius, Spacing } from '@/constants/theme';

const FAQS: { q: string; a: string }[] = [
  {
    q: 'How do I prove I completed a task?',
    a: 'Every task is verified by a photo taken in the moment. Most tasks require a live photo from the in-app camera, so an old photo from your gallery will not work. A few tasks (ones that ask for a screenshot, like a step count) instead let you pick from your phone\'s Screenshots album. The task description always tells you which one it wants.',
  },
  {
    q: 'Why was my photo rejected?',
    a: 'Every submission is checked automatically against the task description. If the photo does not clearly show what the task asked for, it gets rejected with a short reason so you know what to try differently. Retake the photo and submit again.',
  },
  {
    q: "What's the difference between the friends feed and the public feed?",
    a: 'Your account is private by default, so completed quests only show up to your friends. Turning on "Share to public feed" in Settings also posts your quests to the public feed, where any other Gumpa user can see them. You can switch this off again at any time.',
  },
  {
    q: 'What are tokens and levels for?',
    a: 'You earn tokens and XP for every verified task. XP adds up toward your level, and tokens are Gumpa\'s in-app currency. Token redemption (Gumpa+) is coming soon. Keep completing tasks and your balance will be ready when it launches.',
  },
  {
    q: 'How does my day streak work?',
    a: 'Your streak counts consecutive days with at least one verified task. Missing a full day resets it back to zero, so the surest way to protect it is to knock out a quick daily task before you go to bed.',
  },
  {
    q: 'What are local tasks and why does the app need my location?',
    a: 'Local tasks are extra challenges tied to real, named places near you, like a specific park or cafe. Gumpa only uses your location to find those nearby spots. You can turn local tasks off at any time in Settings, which stops all location use for this feature.',
  },
  {
    q: "Can I get a different task if I don't like the one I'm given?",
    a: 'No. Tasks are meant to nudge you slightly outside your comfort zone, and being able to swap one out for an easier one would defeat the point. If a task genuinely does not work for you (for example, it is not accessible where you live), it will naturally rotate out over time.',
  },
  {
    q: 'I never got my verification or password reset email. What do I do?',
    a: 'Check your spam or promotions folder first. If it still has not arrived after a few minutes, use "Resend" in Settings under Account to send another one. Email delivery to some inboxes is still being finalized as we roll out to more users.',
  },
  {
    q: 'How do I delete my account?',
    a: 'Self-serve account deletion is not built yet. In the meantime, log out from Settings to stop using the app on this device, and reach out through the app store listing if you want your data removed.',
  },
  {
    q: 'Is my quest photo visible to strangers?',
    a: 'Only if your account is set to public (see "Share to public feed" in Settings). Photos submitted while your account is private are only visible to your friends. Treat every photo you take as something a real person will see, since strangers on the public feed are real Gumpa users too.',
  },
];

export default function FaqScreen() {
  const insets = useSafeAreaInsets();
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.two }]}>
      <BackButton />
      <Text style={styles.pageTitle}>FAQs</Text>
      <Text style={styles.pageSubtitle}>Common questions about how Gumpa works.</Text>

      <View style={styles.card}>
        {FAQS.map((item, i) => (
          <View key={item.q}>
            {i > 0 && <View style={styles.divider} />}
            <FaqRow item={item} open={openIndex === i} onToggle={() => setOpenIndex(openIndex === i ? null : i)} />
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function FaqRow({ item, open, onToggle }: { item: { q: string; a: string }; open: boolean; onToggle: () => void }) {
  const rotation = useSharedValue(0);
  useEffect(() => {
    rotation.value = withTiming(open ? 180 : 0, { duration: 160 });
  }, [open, rotation]);
  const chevronStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));

  return (
    <Pressable onPress={onToggle} style={styles.row}>
      <View style={styles.rowHeader}>
        <Text style={styles.question}>{item.q}</Text>
        <Animated.View style={chevronStyle}>
          <ChevronDownIcon size={16} color={Colors.muted} />
        </Animated.View>
      </View>
      {open && <Text style={styles.answer}>{item.a}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.three, paddingBottom: Spacing.six },
  pageTitle: { fontSize: 26, fontWeight: '800', color: Colors.ink },
  pageSubtitle: { fontSize: 13.5, color: Colors.muted, marginTop: 4, marginBottom: Spacing.three, lineHeight: 19 },
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.card,
    paddingHorizontal: Spacing.three,
  },
  divider: { height: 1, backgroundColor: Colors.line },
  row: { paddingVertical: Spacing.three },
  rowHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  question: { flex: 1, fontSize: 14.5, fontWeight: '800', color: Colors.ink, lineHeight: 20 },
  answer: { fontSize: 13.5, color: Colors.muted, lineHeight: 20, marginTop: 10 },
});
