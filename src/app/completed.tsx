import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackButton } from '@/components/back-button';
import { TrashIcon } from '@/components/rail-icons';
import { StarRating } from '@/components/star-rating';
import { Colors, Radius, Shadow, Spacing } from '@/constants/theme';
import { photoUrl } from '@/lib/api';
import { useAuthStore } from '@/lib/auth';
import { deleteMyPost, fetchMyPosts, type MyPost } from '@/lib/posts';
import { useToastStore } from '@/lib/toast';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function formatDate(ts: number) {
  const d = new Date(ts);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

// The "Completed" column reached from the Tasks screen's header button —
// every completed task creates a post server-side, so this is just that
// user's own posts (see server/src/feed.ts's handleListMyPosts): photo,
// coins earned, description, and star rating, newest first.
export default function CompletedScreen() {
  const insets = useSafeAreaInsets();
  const token = useAuthStore((s) => s.token);
  const show = useToastStore((s) => s.show);
  const [posts, setPosts] = useState<MyPost[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const result = await fetchMyPosts(token);
    if (result.status === 'ok') {
      setPosts(result.posts);
      setLoadError(false);
    } else {
      setLoadError(true);
    }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (post: MyPost) => {
    if (!token) return;
    const previous = posts;
    setPosts((prev) => prev.filter((p) => p.id !== post.id));
    const ok = await deleteMyPost(token, post.id);
    if (!ok) {
      setPosts(previous);
      show("Couldn't delete that post. Try again.");
    }
  };

  return (
    <View style={styles.screen}>
      <FlatList
        data={posts}
        keyExtractor={(p) => p.id}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.two }]}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListHeaderComponent={
          <View>
            <BackButton />
            <Text style={styles.pageTitle}>Completed</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.cardWrap}>
            <CompletedPostCard post={item} onDelete={() => handleDelete(item)} />
          </View>
        )}
        ListEmptyComponent={
          !loading ? (
            <Text style={styles.empty}>
              {loadError
                ? "Couldn't load your completed tasks. Check your connection and pull down to retry."
                : 'No completed quests yet. Finish a task to see it here.'}
            </Text>
          ) : null
        }
      />
    </View>
  );
}

// Tap-to-confirm rather than a native Alert: this app never uses
// Alert.alert anywhere (its web build via react-native-web has spotty
// support for it), so a two-tap inline confirm matches the rest of the
// app's pattern and works identically on native and web.
const DELETE_CONFIRM_TIMEOUT_MS = 4000;

function CompletedPostCard({ post, onDelete }: { post: MyPost; onDelete: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handlePressTrash = () => {
    if (confirming) {
      if (resetTimer.current) clearTimeout(resetTimer.current);
      onDelete();
      return;
    }
    setConfirming(true);
    resetTimer.current = setTimeout(() => setConfirming(false), DELETE_CONFIRM_TIMEOUT_MS);
  };

  return (
    <View style={styles.card}>
      {post.photoKey && <Image source={{ uri: photoUrl(post.photoKey) }} style={styles.photo} contentFit="cover" />}
      <View style={styles.cardBody}>
        <View style={styles.header}>
          <Text style={[styles.title, styles.titleFlex]}>{post.questTitle}</Text>
          {typeof post.tokensEarned === 'number' && (
            <View style={styles.rewardPill}>
              <Text style={styles.rewardText}>+{post.tokensEarned} 🪙</Text>
            </View>
          )}
        </View>
        {!!post.questDesc && <Text style={styles.questDesc}>{post.questDesc}</Text>}
        {!!post.rating && <StarRating value={post.rating} size={15} />}
        {!!post.caption && <Text style={styles.caption}>"{post.caption}"</Text>}
        <View style={styles.footerRow}>
          <Text style={styles.date}>✓ {formatDate(post.createdAt)}</Text>
          <Pressable hitSlop={8} style={[styles.deleteBtn, confirming && styles.deleteBtnConfirming]} onPress={handlePressTrash}>
            {confirming ? <Text style={styles.deleteConfirmText}>Tap to confirm</Text> : <TrashIcon size={16} color={Colors.muted} />}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.three, paddingBottom: Spacing.six },
  pageTitle: { fontSize: 26, fontWeight: '800', color: Colors.ink, marginBottom: Spacing.four },
  cardWrap: { marginBottom: Spacing.two + 2 },
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.card,
    overflow: 'hidden',
    ...Shadow,
  },
  photo: { width: '100%', height: 180, backgroundColor: Colors.line },
  cardBody: { padding: Spacing.three + 4, gap: 6 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: Spacing.two },
  title: { fontSize: 16, fontWeight: '800', color: Colors.ink, lineHeight: 21 },
  titleFlex: { flex: 1 },
  questDesc: { fontSize: 13, color: Colors.muted, lineHeight: 18 },
  caption: { fontSize: 13.5, color: Colors.ink, fontStyle: 'italic', lineHeight: 18 },
  date: { fontSize: 12, color: Colors.muted, fontWeight: '700' },
  rewardPill: { backgroundColor: Colors.goldSoft, borderRadius: Radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  rewardText: { fontWeight: '800', color: Colors.goldText, fontSize: 13 },
  empty: { textAlign: 'center', color: Colors.muted, paddingVertical: 40 },
  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  deleteBtn: { padding: 4, borderRadius: Radius.sm },
  deleteBtnConfirming: { backgroundColor: Colors.red + '1A' },
  deleteConfirmText: { color: Colors.red, fontWeight: '800', fontSize: 11.5 },
});
