// Gumpa — the Gumpa+ paywall/marketing popup. Shown wherever the app
// already invites a tap on "Gumpa+" (the Rewards screen's unlock pill, its
// "G+" badges, and a locked reward tier) — see src/app/rewards.tsx.
//
// Leads with the perks that cost the business nothing (earn multiplier,
// streak protection, early access, the profile badge) and puts capped
// gift-card redemption last, on purpose: redemption alone isn't a sellable
// pitch (pay $9.99, get back at most $5), so it's framed here as a bonus on
// top of the bundle, not the headline — see docs/rewards-economy-plan.md
// for the full reasoning. Every perk listed here is already real and live
// server-side; only the subscription purchase itself is still "coming
// soon," since react-native-purchases isn't installed yet (needs a real
// RevenueCat account — docs/gumpa-plus-billing-roadmap.md Phase 6).

import { LinearGradient } from 'expo-linear-gradient';
import type { ComponentType } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BoltIcon, CheckBadgeIcon, LevelIcon, RewardsIcon, StreakIcon, XCircleIcon } from '@/components/rail-icons';
import { Colors, Radius, Shadow, Spacing } from '@/constants/theme';

const PERKS: { Icon: ComponentType<{ size?: number; color?: string }>; title: string; desc: string }[] = [
  { Icon: BoltIcon, title: '1.5x tokens, automatically', desc: 'Every quest you complete earns faster. No extra effort, it just adds up quicker.' },
  { Icon: StreakIcon, title: 'Streak protection', desc: "Miss a day and your streak survives — one skip forgiven, no penalty." },
  { Icon: LevelIcon, title: 'Early access', desc: 'See new challenges before they open up to everyone else.' },
  { Icon: CheckBadgeIcon, title: 'A Gumpa+ badge', desc: 'Right on your profile, next to your name.' },
  { Icon: RewardsIcon, title: 'Real rewards, on us', desc: 'Redeem up to $5 a month in gift cards — Starbucks, Chipotle, CAVA, and more.' },
];

export function GumpaPlusModal({
  visible,
  onClose,
  onSubscribe,
}: {
  visible: boolean;
  onClose: () => void;
  onSubscribe: () => void;
}) {
  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <LinearGradient colors={[Colors.accent, Colors.accent2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
            <Pressable testID="gumpa-plus-modal-close" hitSlop={10} style={styles.closeBtn} onPress={onClose}>
              <XCircleIcon size={22} color="#fff" />
            </Pressable>
            <Text style={styles.headerEyebrow}>UNLOCK</Text>
            <Text style={styles.headerTitle}>Gumpa+</Text>
            <Text style={styles.headerSubtitle}>Everything you're already doing, just more of it.</Text>
          </LinearGradient>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
            {PERKS.map((perk) => (
              <View key={perk.title} style={styles.perkRow}>
                <View style={styles.perkIcon}>
                  <perk.Icon size={18} color={Colors.accent} />
                </View>
                <View style={styles.perkText}>
                  <Text style={styles.perkTitle}>{perk.title}</Text>
                  <Text style={styles.perkDesc}>{perk.desc}</Text>
                </View>
              </View>
            ))}
          </ScrollView>

          <View style={styles.footer}>
            <Pressable testID="gumpa-plus-modal-subscribe" style={styles.subscribeBtn} onPress={onSubscribe}>
              <Text style={styles.subscribeBtnText}>Unlock Gumpa+ — $9.99/mo</Text>
            </Pressable>
            <Pressable hitSlop={8} onPress={onClose}>
              <Text style={styles.laterText}>Maybe later</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(17,18,20,0.55)', alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  card: {
    width: '100%',
    maxWidth: 380,
    maxHeight: '86%',
    backgroundColor: Colors.card,
    borderRadius: Radius.card,
    overflow: 'hidden',
    ...Shadow,
  },
  header: { paddingTop: Spacing.four, paddingBottom: Spacing.four, paddingHorizontal: Spacing.four, alignItems: 'center' },
  closeBtn: { position: 'absolute', top: Spacing.three, right: Spacing.three, padding: 2 },
  headerEyebrow: { fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.75)', letterSpacing: 1.2, marginBottom: 2 },
  headerTitle: { fontSize: 28, fontWeight: '800', color: '#fff', marginBottom: 6 },
  headerSubtitle: { fontSize: 13, color: 'rgba(255,255,255,0.9)', textAlign: 'center', lineHeight: 18 },
  body: { flexGrow: 0 },
  bodyContent: { padding: Spacing.four, gap: Spacing.three + 2 },
  perkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.three },
  perkIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  perkText: { flex: 1, gap: 2 },
  perkTitle: { fontSize: 14.5, fontWeight: '800', color: Colors.ink },
  perkDesc: { fontSize: 12.5, color: Colors.muted, lineHeight: 17 },
  footer: { padding: Spacing.four, paddingTop: Spacing.two, alignItems: 'center', gap: Spacing.two + 2 },
  subscribeBtn: {
    alignSelf: 'stretch',
    backgroundColor: Colors.accent,
    borderRadius: Radius.sm,
    paddingVertical: 15,
    alignItems: 'center',
  },
  subscribeBtnText: { color: '#fff', fontWeight: '800', fontSize: 15.5 },
  laterText: { color: Colors.muted, fontWeight: '700', fontSize: 13 },
});
