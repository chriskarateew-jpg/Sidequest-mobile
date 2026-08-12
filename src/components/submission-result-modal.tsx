// Gumpa — the outcome popup shown after a photo proof attempt resolves.
// 'submitted' is the reward moment (tokens/photo/task, already posted to the
// feed by the time this shows — see submit-review.tsx's handlePost). 'not-
// submitted' covers every way a proof attempt can fail to become a post: the
// /verify vision check saying the photo doesn't match, or /complete's fraud
// checks rejecting it (duplicate photo, GPS too far from the pinned venue).
// Centered card modal, same chrome as RecommendationModal.

import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { CheckBadgeIcon, XCircleIcon } from '@/components/rail-icons';
import { TokenBadge } from '@/components/token-badge';
import { Colors, Radius, Shadow, Spacing } from '@/constants/theme';

export type SubmissionResult =
  | { status: 'submitted'; tokens: number; photoUri: string; title: string; desc: string }
  | { status: 'not-submitted'; reason: string };

// Try Again always closes this popup immediately and re-opens capture (see
// challenge-card.tsx/submit-review.tsx) rather than retrying in place, so
// there's no in-modal loading state to show here.
export function SubmissionResultModal({
  result,
  onPost,
  onTryAgain,
  onExit,
}: {
  result: SubmissionResult | null;
  onPost: () => void;
  onTryAgain: () => void;
  onExit: () => void;
}) {
  return (
    <Modal visible={!!result} animationType="fade" transparent statusBarTranslucent onRequestClose={onExit}>
      <View style={styles.backdrop}>
        {result?.status === 'submitted' && (
          <View style={styles.card}>
            <LinearGradient colors={[Colors.accent, Colors.accent2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
              <View style={styles.iconWrap}>
                <CheckBadgeIcon size={28} color="#fff" />
              </View>
              <Text style={styles.headerTitle}>Submitted!</Text>
              <Text style={styles.headerSubtitle}>Nice work, that's real proof.</Text>
            </LinearGradient>
            <View style={styles.body}>
              <Image source={{ uri: result.photoUri }} style={styles.photo} contentFit="cover" />
              <Text style={styles.taskTitle}>{result.title}</Text>
              <Text style={styles.taskDesc}>{result.desc}</Text>
              <View style={styles.rewardRow}>
                <TokenBadge value={`+${result.tokens}`} size="lg" />
              </View>
              <Pressable testID="submission-result-post-button" style={styles.primaryBtn} onPress={onPost}>
                <Text style={styles.primaryBtnText}>Post</Text>
              </Pressable>
            </View>
          </View>
        )}

        {result?.status === 'not-submitted' && (
          <View style={styles.card}>
            <View style={styles.plainHeader}>
              <View style={styles.iconWrapRed}>
                <XCircleIcon size={28} color={Colors.red} />
              </View>
              <Text style={styles.plainHeaderTitle}>Not submitted</Text>
              <Text style={styles.plainHeaderSubtitle}>{result.reason}</Text>
            </View>
            <View style={styles.actions}>
              <Pressable testID="submission-result-exit-button" style={styles.secondaryBtn} onPress={onExit}>
                <Text style={styles.secondaryBtnText}>Exit</Text>
              </Pressable>
              <Pressable testID="submission-result-retry-button" style={[styles.primaryBtn, styles.flexBtn]} onPress={onTryAgain}>
                <Text style={styles.primaryBtnText}>Try Again</Text>
              </Pressable>
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
  header: { paddingVertical: Spacing.four, paddingHorizontal: Spacing.four, alignItems: 'center' },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  headerTitle: { fontSize: 19, fontWeight: '800', color: '#fff', marginBottom: 5, textAlign: 'center' },
  headerSubtitle: { fontSize: 12.5, color: 'rgba(255,255,255,0.85)', textAlign: 'center', lineHeight: 17.5 },
  body: { padding: Spacing.four, gap: 10, alignItems: 'center' },
  photo: { width: '100%', height: 170, borderRadius: Radius.sm, backgroundColor: Colors.line },
  taskTitle: { fontSize: 17, fontWeight: '800', color: Colors.ink, textAlign: 'center' },
  taskDesc: { fontSize: 13, color: Colors.muted, textAlign: 'center', lineHeight: 18 },
  rewardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.goldSoft,
    borderRadius: Radius.pill,
    paddingHorizontal: 18,
    paddingVertical: 9,
    marginTop: 4,
  },
  // Not-submitted state skips the gradient header — a failure shouldn't wear
  // the same celebratory brand treatment as a success.
  plainHeader: { padding: Spacing.four, alignItems: 'center' },
  iconWrapRed: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,59,48,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  plainHeaderTitle: { fontSize: 19, fontWeight: '800', color: Colors.ink, marginBottom: 5, textAlign: 'center' },
  plainHeaderSubtitle: { fontSize: 13.5, color: Colors.muted, textAlign: 'center', lineHeight: 19 },
  actions: { flexDirection: 'row', gap: 10, padding: Spacing.four, paddingTop: 0 },
  flexBtn: { flex: 1 },
  secondaryBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: Colors.line,
    borderRadius: Radius.sm,
    paddingVertical: 13,
    alignItems: 'center',
  },
  secondaryBtnText: { color: Colors.ink, fontWeight: '800', fontSize: 14.5 },
  primaryBtn: { alignSelf: 'stretch', backgroundColor: Colors.accent, borderRadius: Radius.sm, paddingVertical: 14, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
