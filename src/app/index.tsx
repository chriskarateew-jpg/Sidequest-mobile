import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import { BottomNav, TAB_BAR_HEIGHT } from '@/components/bottom-nav';
import { CheerIcon, CommentIcon } from '@/components/rail-icons';
import { CommentsModal } from '@/components/comments-modal';
import { Colors, Radius, Shadow, Spacing } from '@/constants/theme';
import { apiFetch, photoUrl } from '@/lib/api';
import { useAuthStore } from '@/lib/auth';

type Scope = 'public' | 'friends';

interface Post {
  id: string;
  username: string;
  questTitle: string;
  questDesc: string;
  photoKey: string | null;
  caption: string | null;
  createdAt: number;
  kudos: number;
  kudosMine: boolean;
  comments: number;
}

// The Social page is the app's home screen — opening the app drops you
// straight into it, no card to tap through first.
export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  const token = useAuthStore((s) => s.token);
  const [scope, setScope] = useState<Scope>('public');
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commentsPostId, setCommentsPostId] = useState<string | null>(null);

  const load = useCallback(
    async (targetScope: Scope) => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiFetch(`/feed/${targetScope}`, { token });
        const data = (await res.json()) as { posts?: Post[]; error?: string };
        if (!res.ok) {
          setError(data.error ?? 'Could not load the feed.');
          setPosts([]);
          return;
        }
        setPosts(data.posts ?? []);
      } catch {
        setError('Could not reach the server.');
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  useEffect(() => {
    load(scope);
  }, [scope, load]);

  const handleToggleKudos = useCallback(
    async (postId: string) => {
      // optimistic — the tap should feel instant, like Strava's kudos
      setPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, kudosMine: !p.kudosMine, kudos: p.kudos + (p.kudosMine ? -1 : 1) } : p))
      );
      try {
        const res = await apiFetch(`/posts/${postId}/kudos`, { method: 'POST', token });
        const data = (await res.json()) as { kudos?: number; kudosMine?: boolean };
        if (res.ok && typeof data.kudos === 'number') {
          setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, kudos: data.kudos!, kudosMine: !!data.kudosMine } : p)));
        }
      } catch {
        // best-effort — a failed toggle just means the count settles back on next refresh
      }
    },
    [token]
  );

  const handleCommentAdded = useCallback((postId: string) => {
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, comments: p.comments + 1 } : p)));
  }, []);

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.two }]}>
        <Text style={styles.title}>Gumpa Social</Text>
      </View>

      <View style={styles.tabs}>
        <TabButton label="Public" active={scope === 'public'} onPress={() => setScope('public')} />
        <TabButton label="Friends" active={scope === 'friends'} onPress={() => setScope('friends')} />
      </View>

      <FlatList
        data={posts}
        keyExtractor={(p) => p.id}
        contentContainerStyle={[styles.list, { paddingBottom: TAB_BAR_HEIGHT + insets.bottom + Spacing.five }]}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load(scope)} />}
        renderItem={({ item }) => (
          <PostCard post={item} onToggleKudos={() => handleToggleKudos(item.id)} onOpenComments={() => setCommentsPostId(item.id)} />
        )}
        ListEmptyComponent={
          !loading ? <Text style={styles.empty}>{error ?? 'No posts yet. Go complete a quest.'}</Text> : null
        }
      />

      <CommentsModal
        postId={commentsPostId}
        visible={commentsPostId !== null}
        onClose={() => setCommentsPostId(null)}
        onCommentAdded={() => commentsPostId && handleCommentAdded(commentsPostId)}
      />

      <BottomNav />
    </View>
  );
}

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.tabBtn, active && styles.tabBtnActive]}>
      <Text style={[styles.tabBtnText, active && styles.tabBtnTextActive]}>{label}</Text>
    </Pressable>
  );
}

function PostCard({
  post,
  onToggleKudos,
  onOpenComments,
}: {
  post: Post;
  onToggleKudos: () => void;
  onOpenComments: () => void;
}) {
  const cheerScale = useSharedValue(1);
  const cheerAnimatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: cheerScale.value }] }));

  const handleCheerPress = () => {
    cheerScale.value = withSequence(withTiming(1.35, { duration: 120 }), withTiming(1, { duration: 180 }));
    onToggleKudos();
  };

  return (
    <View style={styles.card}>
      {post.photoKey && <Image source={{ uri: photoUrl(post.photoKey) }} style={styles.photo} contentFit="cover" />}
      <View style={styles.cardBody}>
        <Text style={styles.username}>@{post.username}</Text>
        <Text style={styles.questTitle}>{post.questTitle}</Text>
        {!!post.questDesc && <Text style={styles.questDesc}>{post.questDesc}</Text>}
        {!!post.caption && <Text style={styles.caption}>"{post.caption}"</Text>}
        <View style={styles.cardFoot}>
          <Text style={styles.time}>{relativeTime(post.createdAt)}</Text>
          <View style={styles.actionsRow}>
            <Pressable onPress={onOpenComments} hitSlop={8} style={styles.actionBtn}>
              <CommentIcon size={16} color={Colors.muted} />
              <Text style={styles.actionBtnText}>{post.comments > 0 ? post.comments : 'Comment'}</Text>
            </Pressable>
            <Pressable onPress={handleCheerPress} hitSlop={8} style={[styles.actionBtn, post.kudosMine && styles.actionBtnActive]}>
              <Animated.View style={cheerAnimatedStyle}>
                <CheerIcon size={16} color={post.kudosMine ? Colors.accent : Colors.muted} filled={post.kudosMine} />
              </Animated.View>
              <Text style={[styles.actionBtnText, post.kudosMine && styles.actionBtnTextActive]}>
                {post.kudos > 0 ? post.kudos : 'Cheer'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bg },
  header: { paddingHorizontal: Spacing.three, marginBottom: Spacing.three },
  title: { fontSize: 26, fontWeight: '800', color: Colors.accent, textAlign: 'center' },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: Spacing.three, marginBottom: Spacing.three, marginTop: Spacing.two },
  tabBtn: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: Radius.pill,
    backgroundColor: Colors.card,
    borderWidth: 1.5,
    borderColor: Colors.line,
  },
  tabBtnActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  tabBtnText: { fontWeight: '800', fontSize: 12, color: Colors.muted },
  tabBtnTextActive: { color: '#fff' },
  list: { paddingHorizontal: Spacing.three },
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.card,
    overflow: 'hidden',
    marginBottom: Spacing.three,
    ...Shadow,
  },
  photo: { width: '100%', height: 220, backgroundColor: Colors.line },
  cardBody: { padding: Spacing.three, gap: 3 },
  username: { fontWeight: '800', fontSize: 12.5, color: Colors.accent },
  questTitle: { fontWeight: '800', fontSize: 15.5, color: Colors.ink },
  questDesc: { fontSize: 13, color: Colors.muted, lineHeight: 18 },
  caption: { fontSize: 13.5, color: Colors.ink, fontStyle: 'italic', lineHeight: 18, marginTop: 4 },
  cardFoot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  time: { fontSize: 11, color: Colors.muted },
  actionsRow: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.bg,
    borderRadius: Radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1.5,
    borderColor: Colors.line,
  },
  actionBtnActive: { backgroundColor: Colors.accentSoft, borderColor: Colors.accent },
  actionBtnText: { fontSize: 12.5, fontWeight: '800', color: Colors.muted },
  actionBtnTextActive: { color: Colors.accent },
  empty: { textAlign: 'center', color: Colors.muted, paddingVertical: 60 },
});
