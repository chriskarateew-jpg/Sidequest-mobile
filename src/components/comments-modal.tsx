// Gumpa — bottom-sheet modal for reading/adding comments on a post, opened
// from the comment button on PostCard (src/app/index.tsx). Same sheet
// pattern as ScreenshotPicker for consistency.

import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Colors, Radius, Shadow, Spacing } from '@/constants/theme';
import { useAuthStore } from '@/lib/auth';
import { fetchComments, postComment, type Comment } from '@/lib/comments';

const MAX_COMMENT_LENGTH = 500;

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

export function CommentsModal({
  postId,
  visible,
  onClose,
  onCommentAdded,
}: {
  postId: string | null;
  visible: boolean;
  onClose: () => void;
  onCommentAdded?: () => void;
}) {
  const token = useAuthStore((s) => s.token);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    if (!visible || !postId) return;
    setLoading(true);
    fetchComments(postId, token).then((c) => {
      setComments(c);
      setLoading(false);
    });
  }, [visible, postId, token]);

  useEffect(() => {
    if (!visible) setDraft('');
  }, [visible]);

  const handleSend = async () => {
    if (!postId || !token || posting) return;
    const text = draft.trim();
    if (!text) return;
    setPosting(true);
    const comment = await postComment(postId, text, token);
    setPosting(false);
    if (comment) {
      setComments((prev) => [...prev, comment]);
      setDraft('');
      onCommentAdded?.();
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Comments</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator color={Colors.accent} />
            </View>
          ) : (
            <FlatList
              data={comments}
              keyExtractor={(c) => c.id}
              contentContainerStyle={styles.list}
              renderItem={({ item }) => (
                <View style={styles.commentRow}>
                  <View style={styles.commentHead}>
                    <Text style={styles.commentUser}>@{item.username}</Text>
                    <Text style={styles.commentTime}>{relativeTime(item.createdAt)}</Text>
                  </View>
                  <Text style={styles.commentBody}>{item.body}</Text>
                </View>
              )}
              ListEmptyComponent={<Text style={styles.message}>No comments yet. Be the first.</Text>}
            />
          )}

          <View style={styles.inputRow}>
            <TextInput
              testID="comment-input"
              style={styles.input}
              placeholder="Add a comment…"
              placeholderTextColor={Colors.muted}
              value={draft}
              onChangeText={setDraft}
              maxLength={MAX_COMMENT_LENGTH}
              editable={!posting}
            />
            <Pressable
              testID="comment-send-button"
              style={[styles.sendBtn, (!draft.trim() || posting) && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!draft.trim() || posting}>
              <Text style={styles.sendBtnText}>{posting ? '…' : 'Post'}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(17,18,20,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: Radius.card,
    borderTopRightRadius: Radius.card,
    maxHeight: '75%',
    minHeight: '40%',
    paddingTop: Spacing.three,
    ...Shadow,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    marginBottom: Spacing.two,
  },
  title: { fontSize: 16, fontWeight: '800', color: Colors.ink },
  closeText: { fontSize: 14, fontWeight: '700', color: Colors.accent },
  centered: { paddingVertical: Spacing.four * 2, paddingHorizontal: Spacing.four, alignItems: 'center' },
  message: { fontSize: 14, color: Colors.muted, textAlign: 'center', lineHeight: 20, paddingVertical: Spacing.four },
  list: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.two, flexGrow: 1 },
  commentRow: { paddingVertical: Spacing.two + 2, borderBottomWidth: 1, borderBottomColor: Colors.line },
  commentHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  commentUser: { fontWeight: '800', fontSize: 12.5, color: Colors.accent },
  commentTime: { fontSize: 11, color: Colors.muted },
  commentBody: { fontSize: 14, color: Colors.ink, lineHeight: 19 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.four,
    borderTopWidth: 1,
    borderTopColor: Colors.line,
  },
  input: {
    flex: 1,
    backgroundColor: Colors.bg,
    borderWidth: 1.5,
    borderColor: Colors.line,
    borderRadius: Radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 13.5,
    color: Colors.ink,
  },
  sendBtn: { backgroundColor: Colors.accent, borderRadius: Radius.pill, paddingHorizontal: 18, paddingVertical: 10 },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnText: { color: '#fff', fontWeight: '800', fontSize: 13.5 },
});
