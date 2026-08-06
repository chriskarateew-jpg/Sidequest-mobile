// Gumpa — card for a time-boxed developer Challenge (see
// server/src/timed-challenges.ts), rendered in its own "Live Challenges"
// section on the Tasks screen (src/app/quests.tsx). Deliberately a separate
// component from ChallengeCard, not a variant of it: the badge is a
// countdown to a global deadline instead of a cadence pill, there's no
// streak path (always a single photo/screenshot), and there's no review
// screen detour — it verifies and submits in one step.
//
// Submission reuses the exact same /verify -> /complete calls ChallengeCard
// uses; the server resolves a timed-challenge id transparently through the
// same catalog (see catalog.ts) and enforces the actual deadline itself —
// this card's countdown is display only.

import type * as MediaLibrary from 'expo-media-library';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { RewardPill } from '@/components/challenge-card';
import { CameraIcon, ScreenshotIcon } from '@/components/rail-icons';
import { ScreenshotPicker } from '@/components/screenshot-picker';
import { Colors, Radius, Shadow, Spacing } from '@/constants/theme';
import { useAuthStore } from '@/lib/auth';
import { submitCompletion } from '@/lib/complete';
import { capturePhoto, resolveScreenshotAsset, type PhotoResult } from '@/lib/photo';
import { useGumpaStore } from '@/lib/store';
import type { TimedChallenge } from '@/lib/timed-challenges';
import { useToastStore } from '@/lib/toast';
import { verifyPhoto } from '@/lib/verify';

type ResolvedPhoto = Extract<PhotoResult, { status: 'ok' }>;
type Stage = 'idle' | 'capturing' | 'verifying' | 'submitting';

// Must match TIMED_CHALLENGE_PERIOD_KEY in server/src/complete.ts — a timed
// Challenge only ever needs one completion ever per user, so it gets this
// fixed key instead of a cadence-computed one.
const TIMED_PERIOD_KEY = 'once';

function formatCountdown(deadlineAt: number): string {
  const diff = deadlineAt - Date.now();
  if (diff <= 0) return 'Ended';
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m left`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m left`;
  return `${Math.floor(hours / 24)}d left`;
}

export function TimedChallengeCard({ challenge }: { challenge: TimedChallenge }) {
  const completionKey = `${challenge.id}:${TIMED_PERIOD_KEY}`;
  const completion = useGumpaStore((s) => s.completions[completionKey]);
  const syncTokens = useGumpaStore((s) => s.syncTokens);
  const syncCompletion = useGumpaStore((s) => s.syncCompletion);
  const authToken = useAuthStore((s) => s.token);
  const show = useToastStore((s) => s.show);
  const [stage, setStage] = useState<Stage>('idle');
  const [screenshotPickerVisible, setScreenshotPickerVisible] = useState(false);

  const done = completion?.status === 'complete';
  const busy = stage !== 'idle';

  const submitPhoto = async (photo: ResolvedPhoto) => {
    setStage('capturing');
    try {
      if (!authToken) {
        show('Log in to submit photo proof.');
        return;
      }

      setStage('verifying');
      const verdict = await verifyPhoto({ token: authToken, photoBase64: photo.base64, mediaType: photo.mediaType, challengeId: challenge.id });
      if (verdict.status === 'no-match') {
        show(`❌ ${verdict.reason}`);
        return;
      }
      if (verdict.status === 'error') {
        show("Couldn't verify that photo. Check your connection and try again.");
        return;
      }

      setStage('submitting');
      const outcome = await submitCompletion({
        token: authToken,
        challengeId: challenge.id,
        photoBase64: photo.base64,
        mediaType: photo.mediaType,
        photoProof: verdict.photoProof,
        hashThumbnailBase64: photo.hashThumbnailBase64,
        lat: photo.lat,
        lng: photo.lng,
      });

      if (outcome.status === 'error') {
        show("Couldn't reach the server. Check your connection and try again.");
        return;
      }
      if (typeof outcome.result.tokens === 'number') syncTokens(outcome.result.tokens);
      syncCompletion(challenge.id, TIMED_PERIOD_KEY, outcome.result.completion);
      if (outcome.status === 'rejected') {
        show(`❌ ${outcome.reason}`);
        return;
      }
      show(`+${challenge.tokens} tokens!`);
    } finally {
      setStage('idle');
    }
  };

  const handleCameraCapture = async () => {
    const photo = await capturePhoto();
    if (photo.status === 'denied') {
      show('Camera access is required to submit proof.');
      return;
    }
    if (photo.status === 'cancelled') return;
    await submitPhoto(photo);
  };

  const handleScreenshotSelect = async (asset: MediaLibrary.Asset) => {
    setScreenshotPickerVisible(false);
    setStage('capturing');
    const photo = await resolveScreenshotAsset(asset);
    if (photo.status !== 'ok') {
      setStage('idle');
      return;
    }
    await submitPhoto(photo);
  };

  return (
    <>
      <View style={styles.cardShadow}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={[styles.title, styles.titleFlex]}>{challenge.title}</Text>
            <View style={styles.countdownBadge}>
              <Text style={styles.countdownText}>{formatCountdown(challenge.deadlineAt)}</Text>
            </View>
          </View>
          <Text style={styles.desc}>{challenge.desc}</Text>

          {done ? (
            <View style={styles.bottom}>
              <RewardPill tokens={challenge.tokens} />
              <Text style={styles.doneLabel}>✓ Proof submitted</Text>
            </View>
          ) : challenge.proofType === 'either' ? (
            <View style={styles.bottomStacked}>
              <RewardPill tokens={challenge.tokens} />
              <View style={styles.actionRowFull}>
                <Pressable style={[styles.btn, styles.btnFlex, busy && styles.btnDisabled]} disabled={busy} onPress={handleCameraCapture}>
                  {stage === 'verifying' ? (
                    <Text style={styles.btnText}>Verifying…</Text>
                  ) : busy ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <View style={styles.btnContent}>
                      <CameraIcon size={15} />
                      <Text style={styles.btnText}>Complete</Text>
                    </View>
                  )}
                </Pressable>
                <Pressable style={[styles.btn, styles.btnFlex, busy && styles.btnDisabled]} disabled={busy} onPress={() => setScreenshotPickerVisible(true)}>
                  {stage === 'verifying' ? (
                    <Text style={styles.btnText}>Verifying…</Text>
                  ) : busy ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <View style={styles.btnContent}>
                      <ScreenshotIcon size={15} />
                      <Text style={styles.btnText}>Screenshot</Text>
                    </View>
                  )}
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.bottom}>
              <RewardPill tokens={challenge.tokens} />
              <Pressable
                style={[styles.btn, busy && styles.btnDisabled]}
                disabled={busy}
                onPress={challenge.proofType === 'screenshot' ? () => setScreenshotPickerVisible(true) : handleCameraCapture}>
                {stage === 'verifying' ? (
                  <Text style={styles.btnText}>Verifying…</Text>
                ) : busy ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <View style={styles.btnContent}>
                    {challenge.proofType === 'screenshot' ? <ScreenshotIcon size={15} /> : <CameraIcon size={15} />}
                    <Text style={styles.btnText}>{challenge.proofType === 'screenshot' ? 'Screenshot' : 'Complete'}</Text>
                  </View>
                )}
              </Pressable>
            </View>
          )}
        </View>
      </View>
      <ScreenshotPicker visible={screenshotPickerVisible} onClose={() => setScreenshotPickerVisible(false)} onSelect={handleScreenshotSelect} />
    </>
  );
}

const styles = StyleSheet.create({
  cardShadow: { borderRadius: Radius.card, ...Shadow, shadowColor: Colors.red, shadowOpacity: 0.3, shadowRadius: 12 },
  card: { backgroundColor: Colors.card, borderRadius: Radius.card, padding: Spacing.three + 4, gap: Spacing.two, borderWidth: 1.5, borderColor: Colors.red },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: Spacing.two },
  title: { fontSize: 16, fontWeight: '800', color: Colors.ink, lineHeight: 21 },
  titleFlex: { flex: 1 },
  desc: { fontSize: 13.5, color: Colors.muted, lineHeight: 19 },
  countdownBadge: { backgroundColor: Colors.red, borderRadius: Radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  countdownText: { fontSize: 11, fontWeight: '800', color: '#fff', letterSpacing: 0.2 },
  bottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  bottomStacked: { marginTop: 4, gap: Spacing.two },
  doneLabel: { color: Colors.green, fontWeight: '800', fontSize: 13.5 },
  actionRowFull: { flexDirection: 'row', gap: 8 },
  btn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.sm, minWidth: 118, alignItems: 'center', backgroundColor: Colors.accent },
  btnFlex: { flex: 1, minWidth: 0 },
  btnContent: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  btnDisabled: { opacity: 0.7 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
});
