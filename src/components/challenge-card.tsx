import { Image } from 'expo-image';
import { router } from 'expo-router';
import type * as MediaLibrary from 'expo-media-library';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';

import { LocalBarrierBorder } from '@/components/local-barrier';
import { LocationDetailModal } from '@/components/location-detail-modal';
import { CameraIcon, MapPinIcon, ScreenshotIcon } from '@/components/rail-icons';
import { ScreenshotPicker } from '@/components/screenshot-picker';
import { SubmissionResultModal, type SubmissionResult } from '@/components/submission-result-modal';
import { TokenBadge } from '@/components/token-badge';
import { Colors, Radius, Shadow, Spacing } from '@/constants/theme';
import { useAuthStore } from '@/lib/auth';
import { reconcileSubmission, submitCompletion } from '@/lib/complete';
import type { Cadence, Challenge } from '@/lib/data';
import { useDraftSubmissionStore } from '@/lib/draft-submission';
import { capturePhoto, resolveScreenshotAsset, type PhotoResult } from '@/lib/photo';
import { periodKeyFor, useGumpaStore } from '@/lib/store';
import { useToastStore } from '@/lib/toast';
import { verifyPhoto } from '@/lib/verify';

type ResolvedPhoto = Extract<PhotoResult, { status: 'ok' }>;

export const CADENCE_LABEL = { daily: 'TODAY', weekly: 'THIS WEEK', monthly: 'THIS MONTH' } as const;
// Short form for the per-card corner badge — CADENCE_LABEL above stays as
// is since it also feeds inline sentences ("2/3 this week 🔥") where the
// shouty all-caps form doesn't fit.
const CADENCE_SHORT_LABEL: Record<Cadence, string> = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' };

type Stage = 'idle' | 'capturing' | 'verifying' | 'submitting';

// Shared with completed.tsx's CompletedPostCard so every task card — active
// or completed — marks its cadence and reward the same way.
export function CadenceBadge({ cadence }: { cadence: Cadence }) {
  return (
    <View style={badgeStyles.badge}>
      <Text style={badgeStyles.text}>{CADENCE_SHORT_LABEL[cadence]}</Text>
    </View>
  );
}

// boostedTokens, when set, means a developer boost is currently active for
// this challenge (see server/src/boosts.ts) — the original amount shows
// crossed out next to the new one, rather than just swapping the number, so
// the boost itself is visible, not just its result. The pill has no fixed
// width (sized by padding around its row of children), so adding the extra
// crossed-out text simply widens the oval instead of shrinking either
// number to fit.
export function RewardPill({ tokens, boostedTokens }: { tokens: number; boostedTokens?: number }) {
  const boosted = boostedTokens != null && boostedTokens !== tokens;
  return (
    <View style={badgeStyles.rewardPill}>
      <TokenBadge value={`+${boosted ? boostedTokens : tokens}`} strikeValue={boosted ? `+${tokens}` : undefined} size="sm" />
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  badge: {
    backgroundColor: Colors.accentSoft,
    borderRadius: Radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  text: { fontSize: 11, fontWeight: '800', color: Colors.accent, letterSpacing: 0.2 },
  // A chip, not bare text — visibly bigger reward area than a plain "+75 🪙"
  // line, so the payoff reads as a distinct, weighted piece of the card.
  rewardPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.goldSoft,
    borderRadius: Radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
});

export function ChallengeCard({ challenge }: { challenge: Challenge }) {
  const completionKey = `${challenge.id}:${periodKeyFor(challenge.cadence)}`;
  // Select derived primitives directly (not the action methods) so this
  // card re-renders on its own when completions change — selecting a
  // store *function* never triggers a re-render, since the function
  // reference itself is stable across state updates.
  const completion = useGumpaStore((s) => s.completions[completionKey]);
  const logStreakPhoto = useGumpaStore((s) => s.logStreakPhoto);
  const boost = useGumpaStore((s) => s.activeBoosts[challenge.id]);
  const authToken = useAuthStore((s) => s.token);
  const show = useToastStore((s) => s.show);
  const [stage, setStage] = useState<Stage>('idle');
  const [screenshotPickerVisible, setScreenshotPickerVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [result, setResult] = useState<SubmissionResult | null>(null);

  const done = completion?.status === 'complete';
  const busy = stage !== 'idle';
  // The outline/glow marks any real-place challenge, whether or not a city
  // photo happened to be fetched for it — bgImage is a bonus, not the signal.
  const isLocal = !!challenge.isLocal;

  // Runs /verify on a photo and, on a match, either hands off to the review
  // screen or (in-progress streak check-in) commits it right away. On any
  // failure — no-match, a verify error, or a rejected in-progress check-in —
  // it surfaces the "Not submitted" popup; Try Again (see
  // handleTryAgainVerify below) re-opens capture for a fresh photo rather
  // than resending these same bytes, since a duplicate-photo or GPS-mismatch
  // rejection would just fail identically again on the exact same shot.
  const verifyAndProceed = async (photo: ResolvedPhoto) => {
    const verdict = await verifyPhoto({
      token: authToken!,
      photoBase64: photo.base64,
      mediaType: photo.mediaType,
      challengeId: challenge.id,
    });

    if (verdict.status === 'no-match') {
      setResult({ status: 'not-submitted', reason: verdict.reason });
      return;
    }
    if (verdict.status === 'error') {
      setResult({ status: 'not-submitted', reason: "Couldn't verify that photo. Check your connection and try again." });
      return;
    }

    // A streak check-in that finishes the streak (or any non-streak
    // challenge, which always completes in one shot) hands off to the
    // review screen instead of posting immediately — the user gets a
    // chance to add a description and star rating and see the photo
    // before it's final. A streak check-in that's still in progress has
    // no post/coins/review involved yet, so it still commits right away.
    const willComplete = challenge.verify !== 'streak' || (completion?.progress ?? 0) + 1 >= (challenge.streakTarget ?? Infinity);
    if (willComplete) {
      useDraftSubmissionStore.getState().setPending({
        challenge,
        photoUri: photo.uri,
        photoBase64: photo.base64,
        mediaType: photo.mediaType,
        photoProof: verdict.photoProof,
        hashThumbnailBase64: photo.hashThumbnailBase64,
        lat: photo.lat,
        lng: photo.lng,
      });
      router.push('/submit-review');
      return;
    }

    setStage('submitting');
    const streakResult = logStreakPhoto(challenge.id, photo.uri);
    if (!streakResult) {
      show('Already logged today. Come back tomorrow.');
      return;
    }
    show(`Logged! ${streakResult.progress}/${streakResult.target} ${CADENCE_LABEL[streakResult.challenge.cadence].toLowerCase()} 🔥`);
    const outcome = await reconcileSubmission(challenge, () =>
      submitCompletion({
        token: authToken!,
        challengeId: challenge.id,
        photoBase64: photo.base64,
        mediaType: photo.mediaType,
        photoProof: verdict.photoProof,
        hashThumbnailBase64: photo.hashThumbnailBase64,
        lat: photo.lat,
        lng: photo.lng,
      })
    );
    // A deliberate server-side refusal (duplicate photo, location mismatch) —
    // reconcileSubmission above already rolled back whatever was applied
    // optimistically to the server's authoritative state.
    if (outcome.status === 'rejected') {
      setResult({ status: 'not-submitted', reason: outcome.reason });
    }
  };

  // Every challenge is photo-verified — 'streak' just spreads that across
  // several check-ins (one per calendar day) instead of completing outright.
  // Shared by both proof paths (live camera / screenshot picker) — the two
  // capture entry points below just resolve a photo and hand it here.
  const submitPhoto = async (photo: ResolvedPhoto) => {
    setStage('capturing');
    try {
      if (!authToken) {
        show('Log in to submit photo proof.');
        return;
      }
      setStage('verifying');
      await verifyAndProceed(photo);
    } finally {
      setStage('idle');
    }
  };

  // Re-prompts for a brand new photo/screenshot rather than resubmitting the
  // one that just failed — screenshot-only tasks reopen the picker,
  // everything else (camera or either) reopens the live camera.
  const handleTryAgainVerify = () => {
    setResult(null);
    if (challenge.proofType === 'screenshot') {
      setScreenshotPickerVisible(true);
    } else {
      handleCameraCapture();
    }
  };

  const handleExitResult = () => {
    setResult(null);
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
    <View style={[styles.cardShadow, isLocal && styles.cardShadowLocal, done && styles.cardDone]}>
      <View style={[styles.card, isLocal && styles.cardLocal]}>
        {challenge.bgImage && (
          <>
            <Image source={{ uri: challenge.bgImage }} style={styles.cardBgImage} contentFit="cover" />
            <View style={styles.cardScrim} />
          </>
        )}
        {isLocal && <LocalBarrierBorder radius={Radius.card} />}
        <View style={styles.header}>
          <Text style={[styles.title, styles.titleFlex, isLocal && styles.titleLocal]}>{challenge.title}</Text>
          {isLocal && (
            <Pressable testID="location-detail-button" style={styles.infoBtn} hitSlop={8} onPress={() => setDetailVisible(true)}>
              <MapPinIcon size={15} color="#fff" />
            </Pressable>
          )}
          <CadenceBadge cadence={challenge.cadence} />
        </View>
        <Text style={[styles.desc, isLocal && styles.descLocal]}>{challenge.desc}</Text>

        {challenge.verify === 'streak' && !done && (
          <Text style={[styles.progress, isLocal && styles.progressLocal]}>
            {completion?.progress ?? 0}/{challenge.streakTarget} {CADENCE_LABEL[challenge.cadence].toLowerCase()}
          </Text>
        )}

        {done ? (
          <View style={styles.bottom}>
            <RewardPill tokens={challenge.tokens} boostedTokens={boost?.tokens} />
            <Text style={styles.doneLabel}>{challenge.verify === 'streak' ? '✓ Streak complete' : '✓ Proof submitted'}</Text>
          </View>
        ) : challenge.proofType === 'either' ? (
          // Two submission methods don't fit comfortably alongside the
          // reward pill on one line — give the pill its own row and let
          // both buttons split the full width evenly below, instead of
          // squeezing three elements into one crowded row.
          <View style={styles.bottomStacked}>
            <RewardPill tokens={challenge.tokens} boostedTokens={boost?.tokens} />
            <View style={styles.actionRowFull}>
              <Pressable
                style={[styles.btn, styles.btnPrimary, styles.btnFlex, busy && styles.btnDisabled]}
                disabled={busy}
                onPress={handleCameraCapture}>
                {stage === 'verifying' ? (
                  <Text style={styles.btnPrimaryText}>Verifying…</Text>
                ) : busy ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <View style={styles.btnContent}>
                    <CameraIcon size={15} />
                    <Text style={styles.btnPrimaryText}>{challenge.verify === 'streak' ? 'Log today' : 'Complete'}</Text>
                  </View>
                )}
              </Pressable>
              <Pressable
                style={[styles.btn, styles.btnPrimary, styles.btnFlex, busy && styles.btnDisabled]}
                disabled={busy}
                onPress={() => setScreenshotPickerVisible(true)}>
                {stage === 'verifying' ? (
                  <Text style={styles.btnPrimaryText}>Verifying…</Text>
                ) : busy ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <View style={styles.btnContent}>
                    <ScreenshotIcon size={15} />
                    <Text style={styles.btnPrimaryText}>Screenshot</Text>
                  </View>
                )}
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.bottom}>
            <RewardPill tokens={challenge.tokens} boostedTokens={boost?.tokens} />
            <View style={styles.actionRow}>
              {challenge.proofType === 'camera' && (
                <Pressable
                  style={[styles.btn, styles.btnPrimary, busy && styles.btnDisabled]}
                  disabled={busy}
                  onPress={handleCameraCapture}>
                  {stage === 'verifying' ? (
                    <Text style={styles.btnPrimaryText}>Verifying…</Text>
                  ) : busy ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <View style={styles.btnContent}>
                      <CameraIcon size={15} />
                      <Text style={styles.btnPrimaryText}>{challenge.verify === 'streak' ? 'Log today' : 'Complete'}</Text>
                    </View>
                  )}
                </Pressable>
              )}
              {challenge.proofType === 'screenshot' && (
                <Pressable
                  style={[styles.btn, styles.btnPrimary, busy && styles.btnDisabled]}
                  disabled={busy}
                  onPress={() => setScreenshotPickerVisible(true)}>
                  {stage === 'verifying' ? (
                    <Text style={styles.btnPrimaryText}>Verifying…</Text>
                  ) : busy ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <View style={styles.btnContent}>
                      <ScreenshotIcon size={15} />
                      <Text style={styles.btnPrimaryText}>Screenshot</Text>
                    </View>
                  )}
                </Pressable>
              )}
            </View>
          </View>
        )}
      </View>
    </View>
    <ScreenshotPicker visible={screenshotPickerVisible} onClose={() => setScreenshotPickerVisible(false)} onSelect={handleScreenshotSelect} />
    {isLocal && <LocationDetailModal challenge={detailVisible ? challenge : null} onClose={() => setDetailVisible(false)} />}
    <SubmissionResultModal result={result} onPost={handleExitResult} onTryAgain={handleTryAgainVerify} onExit={handleExitResult} />
    </>
  );
}

const styles = StyleSheet.create({
  // Split from the inner body so the (possible) background image can be
  // clipped to the card's rounded corners via overflow:'hidden' without
  // also clipping this view's shadow — overflow:'hidden' and shadow on the
  // same view clip the shadow away on iOS.
  cardShadow: { borderRadius: Radius.card, ...Shadow },
  // Location-tied cards get a colored glow instead of the plain neutral
  // shadow, on top of the animated barrier stripe below — two reinforcing
  // signals (not one) so a real-place task reads as distinct at a glance
  // among a list of ordinary cards. Same brand blue as the barrier itself,
  // not a separate accent color.
  cardShadowLocal: { shadowColor: Colors.accent, shadowOpacity: 0.35, shadowRadius: 12 },
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
  // over a photo of unknown brightness. The animated barrier (see
  // LocalBarrierBorder) is the primary "this is a real nearby place" signal.
  cardLocal: { backgroundColor: Colors.ink },
  cardBgImage: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.55 },
  cardScrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(17,18,20,0.4)' },
  cardDone: { opacity: 0.6 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: Spacing.two },
  title: { fontSize: 16, fontWeight: '800', color: Colors.ink, lineHeight: 21 },
  titleFlex: { flex: 1 },
  titleLocal: { color: '#fff' },
  // Local-only tap target that opens LocationDetailModal — sits on the dark
  // scrim/bg-image area every local card already has, so a translucent
  // white circle reads clearly without needing its own background color.
  infoBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  desc: { fontSize: 13.5, color: Colors.muted, lineHeight: 19 },
  descLocal: { color: 'rgba(255,255,255,0.85)' },
  progress: { fontSize: 12.5, fontWeight: '800', color: Colors.accent },
  progressLocal: { color: '#fff' },
  bottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  // proofType 'either' only — the reward pill gets its own line so the two
  // submission buttons below have the full card width to share, rather than
  // three elements (pill + 2 buttons) squeezed onto one crowded row.
  bottomStacked: { marginTop: 4, gap: Spacing.two },
  doneLabel: { color: Colors.green, fontWeight: '800', fontSize: 13.5 },
  actionRow: { flexDirection: 'row', gap: 8 },
  actionRowFull: { flexDirection: 'row', gap: 8 },
  btn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.sm, minWidth: 118, alignItems: 'center' },
  // Overrides btn's fixed minWidth so the two either-buttons split actionRowFull evenly instead of each claiming their own fixed width.
  btnFlex: { flex: 1, minWidth: 0 },
  btnContent: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  btnPrimary: { backgroundColor: Colors.accent },
  btnDisabled: { opacity: 0.7 },
  btnPrimaryText: { color: '#fff', fontWeight: '800', fontSize: 13 },
});
