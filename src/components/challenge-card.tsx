import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Colors, Radius, Shadow, Spacing } from '@/constants/theme';
import { useAuthStore } from '@/lib/auth';
import { submitCompletion, type CompleteResult } from '@/lib/complete';
import type { Challenge } from '@/lib/data';
import { capturePhoto } from '@/lib/photo';
import { periodKeyFor, useSidequestStore } from '@/lib/store';
import { useToastStore } from '@/lib/toast';
import { verifyPhoto } from '@/lib/verify';

export const CADENCE_LABEL = { daily: 'TODAY', weekly: 'THIS WEEK', monthly: 'THIS MONTH' } as const;

type Stage = 'idle' | 'capturing' | 'verifying' | 'submitting';
const MAX_CAPTION_LENGTH = 240;

export function ChallengeCard({ challenge }: { challenge: Challenge }) {
  const completionKey = `${challenge.id}:${periodKeyFor(challenge.cadence)}`;
  // Select derived primitives directly (not the action methods) so this
  // card re-renders on its own when completions change — selecting a
  // store *function* never triggers a re-render, since the function
  // reference itself is stable across state updates.
  const completion = useSidequestStore((s) => s.completions[completionKey]);
  const completePhoto = useSidequestStore((s) => s.completePhoto);
  const logStreakPhoto = useSidequestStore((s) => s.logStreakPhoto);
  const authToken = useAuthStore((s) => s.token);
  const show = useToastStore((s) => s.show);
  const [stage, setStage] = useState<Stage>('idle');
  const [caption, setCaption] = useState('');

  const done = completion?.status === 'complete';
  const busy = stage !== 'idle';
  const isLocal = !!challenge.bgImage;

  const syncAfterSubmit = async (submit: () => Promise<CompleteResult | null>) => {
    const result = await submit();
    if (!result) return;
    if (typeof result.tokens === 'number') useSidequestStore.getState().syncTokens(result.tokens);
    useSidequestStore.getState().syncCompletion(challenge.id, periodKeyFor(challenge.cadence), result.completion);
  };

  // Every challenge is photo-verified — 'streak' just spreads that across
  // several check-ins (one per calendar day) instead of completing outright.
  const handlePhotoComplete = async () => {
    setStage('capturing');
    try {
      const photo = await capturePhoto();
      if (photo.status === 'denied') {
        show('Camera access is required to submit proof.');
        return;
      }
      if (photo.status === 'cancelled') return;
      if (!authToken) {
        show('Log in to submit photo proof.');
        return;
      }

      setStage('verifying');
      const verdict = await verifyPhoto({
        token: authToken,
        photoBase64: photo.base64,
        mediaType: photo.mediaType,
        challengeId: challenge.id,
      });

      if (verdict.status === 'no-match') {
        show(`❌ ${verdict.reason}`);
        return;
      }
      if (verdict.status === 'error') {
        show("Couldn't verify that photo — check your connection and try again.");
        return;
      }

      setStage('submitting');
      const submittedCaption = caption.trim();
      setCaption('');

      if (challenge.verify === 'streak') {
        const result = logStreakPhoto(challenge.id, photo.uri);
        if (!result) {
          show('Already logged today — come back tomorrow.');
          return;
        }
        show(
          result.justCompleted
            ? `+${result.challenge.tokens} 🪙  ${result.challenge.title} — streak complete!`
            : `Logged! ${result.progress}/${result.target} ${CADENCE_LABEL[result.challenge.cadence].toLowerCase()} 🔥`
        );
        await syncAfterSubmit(() =>
          submitCompletion({
            token: authToken,
            challengeId: challenge.id,
            photoBase64: photo.base64,
            mediaType: photo.mediaType,
            photoProof: verdict.photoProof,
            caption: submittedCaption || undefined,
          })
        );
      } else {
        const c = completePhoto(challenge.id, photo.uri);
        if (c) {
          show(`+${c.tokens} 🪙  ${c.title} — proof logged!`);
          await syncAfterSubmit(() =>
            submitCompletion({
              token: authToken,
              challengeId: c.id,
              photoBase64: photo.base64,
              mediaType: photo.mediaType,
              photoProof: verdict.photoProof,
              caption: submittedCaption || undefined,
            })
          );
        }
      }
    } finally {
      setStage('idle');
    }
  };

  return (
    <View style={[styles.cardShadow, isLocal && styles.cardShadowLocal, done && styles.cardDone]}>
      <View style={[styles.card, isLocal && styles.cardLocal]}>
        {isLocal && (
          <>
            <Image source={{ uri: challenge.bgImage }} style={styles.cardBgImage} contentFit="cover" />
            <View style={styles.cardScrim} />
          </>
        )}
        <Text style={[styles.cadence, isLocal && styles.cadenceLocal]}>{CADENCE_LABEL[challenge.cadence]}</Text>
        <Text style={[styles.title, isLocal && styles.titleLocal]}>{challenge.title}</Text>
        <Text style={[styles.desc, isLocal && styles.descLocal]}>{challenge.desc}</Text>

        {challenge.verify === 'streak' && !done && (
          <Text style={[styles.progress, isLocal && styles.progressLocal]}>
            {completion?.progress ?? 0}/{challenge.streakTarget} {CADENCE_LABEL[challenge.cadence].toLowerCase()}
          </Text>
        )}

        {!done && (
          <TextInput
            style={[styles.captionInput, isLocal && styles.captionInputLocal]}
            placeholder="Add a note (optional)"
            placeholderTextColor={isLocal ? 'rgba(255,255,255,0.6)' : Colors.muted}
            value={caption}
            onChangeText={setCaption}
            maxLength={MAX_CAPTION_LENGTH}
            editable={!busy}
          />
        )}

        <View style={styles.bottom}>
          <Text style={styles.reward}>+{challenge.tokens} 🪙</Text>
          {done ? (
            <Text style={styles.doneLabel}>{challenge.verify === 'streak' ? '✓ Streak complete' : '✓ Proof submitted'}</Text>
          ) : (
            <Pressable
              style={[styles.btn, styles.btnPrimary, busy && styles.btnDisabled]}
              disabled={busy}
              onPress={handlePhotoComplete}>
              {stage === 'verifying' ? (
                <Text style={styles.btnPrimaryText}>Verifying…</Text>
              ) : busy ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : challenge.verify === 'streak' ? (
                <Text style={styles.btnPrimaryText}>📸 Log today</Text>
              ) : (
                <Text style={styles.btnPrimaryText}>📸 Complete</Text>
              )}
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Split from the inner body so the (possible) background image can be
  // clipped to the card's rounded corners via overflow:'hidden' without
  // also clipping this view's shadow — overflow:'hidden' and shadow on the
  // same view clip the shadow away on iOS.
  cardShadow: { borderRadius: Radius.card, ...Shadow },
  // Location-tied cards get a colored glow instead of the plain neutral
  // shadow, on top of the solid outline below — two reinforcing signals
  // (not one) so a real-place task reads as distinct at a glance among a
  // list of ordinary cards.
  cardShadowLocal: { shadowColor: Colors.localAccent, shadowOpacity: 0.45, shadowRadius: 12 },
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.card,
    padding: Spacing.three + 4,
    gap: Spacing.two,
    overflow: 'hidden',
  },
  // Local (location-tied) challenges drop the white card background in favor
  // of the fetched city image, shown faded rather than as a barely-visible
  // watermark, with a dark scrim underneath the text so it stays legible
  // over a photo of unknown brightness. The solid outline is the primary
  // "this is a real nearby place" signal, distinct from ordinary brand-accent use.
  cardLocal: { backgroundColor: Colors.ink, borderWidth: 2.5, borderColor: Colors.localAccent },
  cardBgImage: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.55 },
  cardScrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(17,18,20,0.4)' },
  cardDone: { opacity: 0.6 },
  cadence: { fontSize: 10.5, fontWeight: '800', color: Colors.muted, letterSpacing: 0.5 },
  cadenceLocal: { color: 'rgba(255,255,255,0.75)' },
  title: { fontSize: 16, fontWeight: '800', color: Colors.ink, lineHeight: 21 },
  titleLocal: { color: '#fff' },
  desc: { fontSize: 13.5, color: Colors.muted, lineHeight: 19 },
  descLocal: { color: 'rgba(255,255,255,0.85)' },
  progress: { fontSize: 12.5, fontWeight: '800', color: Colors.accent },
  progressLocal: { color: '#fff' },
  captionInput: {
    backgroundColor: Colors.bg,
    borderWidth: 1.5,
    borderColor: Colors.line,
    borderRadius: Radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13.5,
    color: Colors.ink,
  },
  captionInputLocal: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderColor: 'rgba(255,255,255,0.4)',
    color: '#fff',
  },
  bottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  reward: { fontWeight: '800', color: Colors.gold, fontSize: 14 },
  doneLabel: { color: Colors.green, fontWeight: '800', fontSize: 13.5 },
  btn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.sm, minWidth: 118, alignItems: 'center' },
  btnPrimary: { backgroundColor: Colors.accent },
  btnDisabled: { opacity: 0.7 },
  btnPrimaryText: { color: '#fff', fontWeight: '800', fontSize: 13 },
});
