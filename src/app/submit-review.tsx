import { Image } from 'expo-image';
import { router } from 'expo-router';
import type * as MediaLibrary from 'expo-media-library';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CadenceBadge, RewardPill } from '@/components/challenge-card';
import { ScreenshotPicker } from '@/components/screenshot-picker';
import { StarRating } from '@/components/star-rating';
import { SubmissionResultModal, type SubmissionResult } from '@/components/submission-result-modal';
import { Colors, Radius, Shadow, Spacing } from '@/constants/theme';
import { useAuthStore } from '@/lib/auth';
import { reconcileSubmission, submitCompletion } from '@/lib/complete';
import { useDraftSubmissionStore } from '@/lib/draft-submission';
import { capturePhoto, resolveScreenshotAsset, type PhotoResult } from '@/lib/photo';
import { useGumpaStore } from '@/lib/store';
import { useToastStore } from '@/lib/toast';
import { verifyPhoto } from '@/lib/verify';

type ResolvedPhoto = Extract<PhotoResult, { status: 'ok' }>;

const MAX_CAPTION_LENGTH = 240;

// Reached from ChallengeCard right after a photo passes /verify, only for a
// submission that's about to complete the task (see the willComplete check
// in challenge-card.tsx). Nothing is committed — locally or server-side —
// until the user taps Post here; backing out leaves the task incomplete so
// they can retake the photo.
export default function SubmitReviewScreen() {
  const insets = useSafeAreaInsets();
  const pending = useDraftSubmissionStore((s) => s.pending);
  const clearPending = useDraftSubmissionStore((s) => s.clear);
  const authToken = useAuthStore((s) => s.token);
  const show = useToastStore((s) => s.show);
  const completePhoto = useGumpaStore((s) => s.completePhoto);
  const logStreakPhoto = useGumpaStore((s) => s.logStreakPhoto);
  const boost = useGumpaStore((s) => (pending ? s.activeBoosts[pending.challenge.id] : undefined));

  const [caption, setCaption] = useState('');
  const [rating, setRating] = useState(0);
  const [posting, setPosting] = useState(false);
  const [result, setResult] = useState<SubmissionResult | null>(null);
  const [verifyingRetry, setVerifyingRetry] = useState(false);
  const [screenshotPickerVisible, setScreenshotPickerVisible] = useState(false);
  const busy = posting || verifyingRetry;

  // Only reachable via the router.push in challenge-card.tsx, which always
  // sets pending first — null here means a stale deep-link/reload, not a
  // real state this screen needs to render for.
  if (!pending) return null;
  const { challenge } = pending;

  const handleCancel = () => {
    clearPending();
    router.back();
  };

  // The actual /complete call — split out so a failed attempt (rejected or
  // network error) can be retried from the "Not submitted" popup without
  // re-running the local optimistic apply in handlePost a second time.
  const attemptSubmit = () => {
    const trimmedCaption = caption.trim();
    return reconcileSubmission(challenge, () =>
      submitCompletion({
        token: authToken!,
        challengeId: challenge.id,
        photoBase64: pending.photoBase64,
        mediaType: pending.mediaType,
        photoProof: pending.photoProof,
        caption: trimmedCaption || undefined,
        rating: rating || undefined,
        hashThumbnailBase64: pending.hashThumbnailBase64,
        lat: pending.lat,
        lng: pending.lng,
      })
    );
  };

  const handlePost = async () => {
    if (!authToken || posting) return;
    setPosting(true);

    const committed =
      challenge.verify === 'streak' ? logStreakPhoto(challenge.id, pending.photoUri) : completePhoto(challenge.id, pending.photoUri);
    if (!committed) {
      show('This task was already completed.');
      clearPending();
      router.back();
      return;
    }

    const outcome = await attemptSubmit();
    setPosting(false);

    if (outcome.status === 'ok') {
      setResult({
        status: 'submitted',
        tokens: boost?.tokens ?? challenge.tokens,
        photoUri: pending.photoUri,
        title: challenge.title,
        desc: challenge.desc,
      });
      return;
    }
    // A deliberate server-side refusal (duplicate photo, location mismatch)
    // or a network/transient error — reconcileSubmission already rolled back
    // whatever was applied optimistically for a 'rejected' outcome.
    setResult({
      status: 'not-submitted',
      reason: outcome.status === 'rejected' ? outcome.reason : "Couldn't submit. Check your connection and try again.",
    });
  };

  // Try Again re-prompts for a brand new photo/screenshot rather than
  // resending the one that just failed — a duplicate-photo or GPS-mismatch
  // rejection would just fail identically again on the exact same shot.
  // Re-verifying replaces the pending draft's photo in place and drops the
  // user back on this same review screen (caption/rating preserved) to
  // press Post again, rather than silently resubmitting on their behalf.
  const handleTryAgain = () => {
    setResult(null);
    if (challenge.proofType === 'screenshot') {
      setScreenshotPickerVisible(true);
    } else {
      handleRecapture();
    }
  };

  const handleRecapture = async () => {
    const photo = await capturePhoto();
    if (photo.status === 'denied') {
      show('Camera access is required to submit proof.');
      return;
    }
    if (photo.status === 'cancelled') return;
    await reverifyAndReplace(photo);
  };

  const handleScreenshotRetry = async (asset: MediaLibrary.Asset) => {
    setScreenshotPickerVisible(false);
    const photo = await resolveScreenshotAsset(asset);
    if (photo.status !== 'ok') return;
    await reverifyAndReplace(photo);
  };

  const reverifyAndReplace = async (photo: ResolvedPhoto) => {
    setVerifyingRetry(true);
    const verdict = await verifyPhoto({
      token: authToken!,
      photoBase64: photo.base64,
      mediaType: photo.mediaType,
      challengeId: challenge.id,
    });
    setVerifyingRetry(false);

    if (verdict.status === 'no-match') {
      setResult({ status: 'not-submitted', reason: verdict.reason });
      return;
    }
    if (verdict.status === 'error') {
      setResult({ status: 'not-submitted', reason: "Couldn't verify that photo. Check your connection and try again." });
      return;
    }
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
  };

  const handleResultDone = () => {
    setResult(null);
    clearPending();
    router.back();
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.two }]}>
        <View style={styles.headRow}>
          <Pressable onPress={handleCancel} hitSlop={8} style={styles.closeBtn} disabled={busy}>
            <Text style={styles.closeBtnText}>✕</Text>
          </Pressable>
          <Text style={styles.pageTitle}>Review & post</Text>
          <View style={styles.closeBtnSpacer} />
        </View>

        <View>
          <Image source={{ uri: pending.photoUri }} style={styles.photo} contentFit="cover" />
          {verifyingRetry && (
            <View style={styles.photoOverlay}>
              <ActivityIndicator color="#fff" />
              <Text style={styles.photoOverlayText}>Verifying new photo…</Text>
            </View>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.postingForLabel}>You're posting proof for</Text>
          <View style={styles.header}>
            <Text style={[styles.title, styles.titleFlex]}>{challenge.title}</Text>
            <CadenceBadge cadence={challenge.cadence} />
          </View>
          <Text style={styles.desc}>{challenge.desc}</Text>
          <RewardPill tokens={challenge.tokens} boostedTokens={boost?.tokens} />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Rate this task</Text>
          <StarRating value={rating} onChange={setRating} />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Description (optional)</Text>
          <TextInput
            testID="review-caption-input"
            style={styles.captionInput}
            placeholder="Say something about it…"
            placeholderTextColor={Colors.muted}
            value={caption}
            onChangeText={setCaption}
            maxLength={MAX_CAPTION_LENGTH}
            multiline
            editable={!busy}
          />
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.three }]}>
        <Pressable
          testID="review-post-button"
          style={[styles.postBtn, busy && styles.postBtnDisabled]}
          disabled={busy}
          onPress={handlePost}>
          {busy ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.postBtnText}>Post</Text>}
        </Pressable>
      </View>

      <ScreenshotPicker visible={screenshotPickerVisible} onClose={() => setScreenshotPickerVisible(false)} onSelect={handleScreenshotRetry} />
      <SubmissionResultModal result={result} onPost={handleResultDone} onTryAgain={handleTryAgain} onExit={handleResultDone} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.three, paddingBottom: Spacing.six, gap: Spacing.three },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.two },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow,
  },
  closeBtnSpacer: { width: 32, height: 32 },
  closeBtnText: { fontSize: 15, fontWeight: '800', color: Colors.muted },
  pageTitle: { fontSize: 18, fontWeight: '800', color: Colors.ink },
  photo: { width: '100%', height: 280, borderRadius: Radius.card, backgroundColor: Colors.line },
  photoOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: Radius.card,
    backgroundColor: 'rgba(17,18,20,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  photoOverlayText: { color: '#fff', fontWeight: '800', fontSize: 13.5 },
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.card,
    padding: Spacing.three + 4,
    gap: Spacing.two,
    ...Shadow,
  },
  postingForLabel: { fontSize: 11, fontWeight: '800', color: Colors.muted, letterSpacing: 0.4, textTransform: 'uppercase' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: Spacing.two },
  title: { fontSize: 19, fontWeight: '800', color: Colors.ink, lineHeight: 24 },
  titleFlex: { flex: 1 },
  desc: { fontSize: 13.5, color: Colors.muted, lineHeight: 19 },
  sectionLabel: { fontSize: 12.5, fontWeight: '800', color: Colors.muted, letterSpacing: 0.3 },
  captionInput: {
    backgroundColor: Colors.bg,
    borderWidth: 1.5,
    borderColor: Colors.line,
    borderRadius: Radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13.5,
    color: Colors.ink,
    minHeight: 70,
    textAlignVertical: 'top',
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: Colors.line,
    backgroundColor: Colors.card,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two + 2,
  },
  postBtn: { backgroundColor: Colors.accent, borderRadius: Radius.sm, paddingVertical: 14, alignItems: 'center' },
  postBtnDisabled: { opacity: 0.7 },
  postBtnText: { color: '#fff', fontWeight: '800', fontSize: 15.5 },
});
