import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CadenceBadge, RewardPill } from '@/components/challenge-card';
import { StarRating } from '@/components/star-rating';
import { Colors, Radius, Shadow, Spacing } from '@/constants/theme';
import { useAuthStore } from '@/lib/auth';
import { reconcileSubmission, submitCompletion } from '@/lib/complete';
import { useDraftSubmissionStore } from '@/lib/draft-submission';
import { useGumpaStore } from '@/lib/store';
import { useToastStore } from '@/lib/toast';

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

  const [caption, setCaption] = useState('');
  const [rating, setRating] = useState(0);
  const [posting, setPosting] = useState(false);

  // Only reachable via the router.push in challenge-card.tsx, which always
  // sets pending first — null here means a stale deep-link/reload, not a
  // real state this screen needs to render for.
  if (!pending) return null;
  const { challenge } = pending;

  const handleCancel = () => {
    clearPending();
    router.back();
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

    show(`+${challenge.tokens} 🪙  ${challenge.title} posted!`);
    const trimmedCaption = caption.trim();
    const outcome = await reconcileSubmission(challenge, () =>
      submitCompletion({
        token: authToken,
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
    // A deliberate server-side refusal (duplicate photo, location mismatch) —
    // reconcileSubmission above already rolled back whatever was applied
    // optimistically to the server's authoritative state.
    if (outcome.status === 'rejected') show(`❌ ${outcome.reason}`);

    clearPending();
    router.back();
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.two }]}>
        <View style={styles.headRow}>
          <Pressable onPress={handleCancel} hitSlop={8} style={styles.closeBtn} disabled={posting}>
            <Text style={styles.closeBtnText}>✕</Text>
          </Pressable>
          <Text style={styles.pageTitle}>Review & post</Text>
          <View style={styles.closeBtnSpacer} />
        </View>

        <Image source={{ uri: pending.photoUri }} style={styles.photo} contentFit="cover" />

        <View style={styles.card}>
          <Text style={styles.postingForLabel}>You're posting proof for</Text>
          <View style={styles.header}>
            <Text style={[styles.title, styles.titleFlex]}>{challenge.title}</Text>
            <CadenceBadge cadence={challenge.cadence} />
          </View>
          <Text style={styles.desc}>{challenge.desc}</Text>
          <RewardPill tokens={challenge.tokens} />
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
            editable={!posting}
          />
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.three }]}>
        <Pressable
          testID="review-post-button"
          style={[styles.postBtn, posting && styles.postBtnDisabled]}
          disabled={posting}
          onPress={handlePost}>
          {posting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.postBtnText}>Post</Text>}
        </Pressable>
      </View>
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
