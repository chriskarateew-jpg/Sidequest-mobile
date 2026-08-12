// Gumpa — tap-to-expand detail view for a location-based challenge (see
// challenge-card.tsx's map-pin affordance). Centered card modal, same
// backdrop/close pattern as recommendation-modal.tsx: a focused one-off view,
// not a scrollable list, so a card reads better than a bottom sheet here.

import { Image } from 'expo-image';
import { Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { DirectionsIcon } from '@/components/rail-icons';
import { Colors, Radius, Shadow, Spacing } from '@/constants/theme';
import type { Challenge } from '@/lib/data';
import { useToastStore } from '@/lib/toast';

export function LocationDetailModal({ challenge, onClose }: { challenge: Challenge | null; onClose: () => void }) {
  const show = useToastStore((s) => s.show);
  const visible = !!challenge;

  // maps.apple.com is a universal link, not a maps:// scheme URL — it opens
  // straight into the Apple Maps app on iOS when installed, and still
  // resolves as a normal, usable web page on any other platform, so this
  // needs no Platform branching to degrade gracefully.
  const handleDirections = async () => {
    if (!challenge || challenge.lat == null || challenge.lng == null) return;
    const url = `https://maps.apple.com/?daddr=${challenge.lat},${challenge.lng}`;
    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) {
      show("Couldn't open Maps.");
      return;
    }
    Linking.openURL(url);
  };

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        {challenge && (
          <View style={styles.card}>
            <View style={styles.header}>
              {challenge.bgImage && (
                <>
                  <Image source={{ uri: challenge.bgImage }} style={StyleSheet.absoluteFill} contentFit="cover" />
                  <View style={styles.headerScrim} />
                </>
              )}
              {challenge.placeName && <Text style={styles.placeName}>{challenge.placeName}</Text>}
              <Text style={styles.title}>{challenge.title}</Text>
            </View>

            <View style={styles.body}>
              <Text style={styles.longDesc}>{challenge.longDesc ?? challenge.desc}</Text>

              <View style={styles.actions}>
                {challenge.lat != null && challenge.lng != null && (
                  <Pressable style={styles.directionsBtn} onPress={handleDirections}>
                    <DirectionsIcon size={16} color="#fff" />
                    <Text style={styles.directionsBtnText}>Get Directions</Text>
                  </Pressable>
                )}
                <Pressable style={styles.closeBtn} onPress={onClose}>
                  <Text style={styles.closeBtnText}>Close</Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}
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
    overflow: 'hidden',
    ...Shadow,
  },
  header: { minHeight: 140, backgroundColor: Colors.ink, padding: Spacing.four, justifyContent: 'flex-end' },
  headerScrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(17,18,20,0.45)' },
  placeName: { fontSize: 12, fontWeight: '800', color: 'rgba(255,255,255,0.75)', letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 4 },
  title: { fontSize: 20, fontWeight: '800', color: '#fff', lineHeight: 26 },
  body: { padding: Spacing.four, gap: Spacing.three },
  longDesc: { fontSize: 14.5, color: Colors.muted, lineHeight: 21 },
  actions: { flexDirection: 'row', gap: 10 },
  directionsBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.accent,
    borderRadius: Radius.sm,
    paddingVertical: 13,
  },
  directionsBtnText: { color: '#fff', fontWeight: '800', fontSize: 14.5 },
  closeBtn: { flex: 1, borderWidth: 1.5, borderColor: Colors.line, borderRadius: Radius.sm, paddingVertical: 13, alignItems: 'center' },
  closeBtnText: { color: Colors.ink, fontWeight: '800', fontSize: 14.5 },
});
