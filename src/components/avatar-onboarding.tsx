// Gumpa — one-time "add a profile picture" prompt shown right after signup
// (see justSignedUp in src/lib/auth.ts), before the location-onboarding
// modal gets its turn (see _layout.tsx). Skippable — the same picture can be
// set later from Profile, which reuses setAvatar directly rather than this
// component.

import { Image } from 'expo-image';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { ProfileIcon } from '@/components/rail-icons';
import { Colors, Radius, Shadow, Spacing } from '@/constants/theme';
import { useAuthStore } from '@/lib/auth';
import { pickPhotoFromLibrary } from '@/lib/photo';
import { useToastStore } from '@/lib/toast';

export function AvatarOnboarding({ visible }: { visible: boolean }) {
  const setAvatar = useAuthStore((s) => s.setAvatar);
  const clearJustSignedUp = useAuthStore((s) => s.clearJustSignedUp);
  const show = useToastStore((s) => s.show);
  const [picture, setPicture] = useState<{ uri: string; base64: string; mediaType: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const handlePick = async () => {
    const result = await pickPhotoFromLibrary();
    if (result.status === 'ok') setPicture({ uri: result.uri, base64: result.base64, mediaType: result.mediaType });
    else if (result.status === 'denied') show('Photo library access is required to set a profile picture.');
  };

  const handleSave = async () => {
    if (!picture) return;
    setBusy(true);
    const err = await setAvatar(picture.base64, picture.mediaType);
    setBusy(false);
    if (err) {
      show(err);
      return;
    }
    setPicture(null);
    clearJustSignedUp();
  };

  const handleSkip = () => {
    setPicture(null);
    clearJustSignedUp();
  };

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Pressable style={styles.avatarWrap} onPress={handlePick} disabled={busy}>
            {picture ? (
              <Image source={{ uri: picture.uri }} style={styles.avatarImg} contentFit="cover" />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <ProfileIcon size={32} color={Colors.accent} />
              </View>
            )}
          </Pressable>

          <Text style={styles.title}>Add a profile picture</Text>
          <Text style={styles.desc}>Help friends recognize you on the feed. You can always add or change this later from Profile.</Text>

          <Pressable
            style={[styles.btn, styles.btnPrimary, busy && styles.btnDisabled]}
            disabled={busy}
            onPress={picture ? handleSave : handlePick}>
            <Text style={styles.btnPrimaryText}>{busy ? 'Saving…' : picture ? 'Save photo' : 'Choose a photo'}</Text>
          </Pressable>
          <Pressable style={styles.btn} disabled={busy} onPress={handleSkip}>
            <Text style={styles.btnSecondaryText}>Skip for now</Text>
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
  avatarWrap: { marginBottom: Spacing.one },
  avatarImg: { width: 88, height: 88, borderRadius: 44, backgroundColor: Colors.line },
  avatarPlaceholder: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: Colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 19, fontWeight: '800', color: Colors.ink, textAlign: 'center', lineHeight: 25 },
  desc: { fontSize: 14, color: Colors.muted, textAlign: 'center', lineHeight: 20, marginBottom: Spacing.two },
  btn: { width: '100%', paddingVertical: 14, borderRadius: Radius.sm, alignItems: 'center' },
  btnPrimary: { backgroundColor: Colors.accent },
  btnDisabled: { opacity: 0.7 },
  btnPrimaryText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  btnSecondaryText: { color: Colors.muted, fontWeight: '700', fontSize: 14 },
});
