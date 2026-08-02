import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackButton } from '@/components/back-button';
import { StarRating } from '@/components/star-rating';
import { Colors, Radius, Shadow, Spacing } from '@/constants/theme';
import { photoUrl } from '@/lib/api';
import { useAuthStore } from '@/lib/auth';
import { fetchMyPosts, type MyPost } from '@/lib/posts';

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
            <CompletedPostCard post={item} />
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

function CompletedPostCard({ post }: { post: MyPost }) {
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
        <Text style={styles.date}>✓ {formatDate(post.createdAt)}</Text>
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
  date: { fontSize: 12, color: Colors.muted, fontWeight: '700', marginTop: 2 },
  rewardPill: { backgroundColor: Colors.goldSoft, borderRadius: Radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  rewardText: { fontWeight: '800', color: Colors.goldText, fontSize: 13 },
  empty: { textAlign: 'center', color: Colors.muted, paddingVertical: 40 },
});
