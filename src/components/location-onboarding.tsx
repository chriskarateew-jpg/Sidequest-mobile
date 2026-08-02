// Gumpa — first-run prompt to enable location, shown right at the root
// as soon as a session exists (see _layout.tsx), instead of waiting for the
// user to scroll into the Tasks tab to discover local tasks exist at all.
// Purely a UI wrapper around store state: refreshLocalChallenges/opt-out
// already fully describe "did we ask, what did they say," so this component
// owns no state of its own beyond the in-flight spinner.

import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';

import { Colors, Radius, Shadow, Spacing } from '@/constants/theme';
import { describeLocalChallengesResult, useGumpaStore } from '@/lib/store';
import { useToastStore } from '@/lib/toast';

export function LocationOnboarding({ visible }: { visible: boolean }) {
  const refreshLocalChallenges = useGumpaStore((s) => s.refreshLocalChallenges);
  const show = useToastStore((s) => s.show);
  const [enabling, setEnabling] = useState(false);

  const handleEnable = async () => {
    setEnabling(true);
    const result = await refreshLocalChallenges(true);
    setEnabling(false);
    const message = describeLocalChallengesResult(result);
    if (message) show(message);
  };

  const handleDismiss = () => {
    useGumpaStore.setState({ locationOptOut: true });
  };

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.emoji}>🧭</Text>
          <Text style={styles.title}>Real tasks, tied to real places near you</Text>
          <Text style={styles.desc}>
            Turn on location and your assignments will include actual nearby parks, cafes, and landmarks worth
            visiting, not just generic to-dos.
          </Text>
          <Text style={styles.proofNote}>📸 Every location task is proven with a photo, so it's clear you actually went.</Text>

          <Pressable style={[styles.btn, styles.btnPrimary, enabling && styles.btnDisabled]} disabled={enabling} onPress={handleEnable}>
            <Text style={styles.btnPrimaryText}>{enabling ? 'Getting your location…' : 'Enable location'}</Text>
          </Pressable>
          <Pressable style={styles.btn} disabled={enabling} onPress={handleDismiss}>
            <Text style={styles.btnSecondaryText}>Not now</Text>
          </Pressable>
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
    backgroundColor: Colors.card,
    borderRadius: Radius.card,
    padding: Spacing.four,
    alignItems: 'center',
    gap: Spacing.two,
    ...Shadow,
  },
  emoji: { fontSize: 40, marginBottom: Spacing.one },
  title: { fontSize: 19, fontWeight: '800', color: Colors.ink, textAlign: 'center', lineHeight: 25 },
  desc: { fontSize: 14, color: Colors.muted, textAlign: 'center', lineHeight: 20 },
  proofNote: {
    fontSize: 12.5,
    color: Colors.accent,
    fontWeight: '700',
    textAlign: 'center',
    backgroundColor: Colors.accentSoft,
    borderRadius: Radius.sm,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 2,
    marginBottom: Spacing.two,
  },
  btn: { width: '100%', paddingVertical: 14, borderRadius: Radius.sm, alignItems: 'center' },
  btnPrimary: { backgroundColor: Colors.accent },
  btnDisabled: { opacity: 0.7 },
  btnPrimaryText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  btnSecondaryText: { color: Colors.muted, fontWeight: '700', fontSize: 14 },
});
