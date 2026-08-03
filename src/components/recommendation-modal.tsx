// Gumpa — "have a recommendation?" popup, opened from Settings. Centered
// card modal (not a bottom sheet like CommentsModal) since this is a
// one-off prompt, not a scrollable list — a focused card reads better for
// "tell us one thing" than a sheet that implies ongoing content below.

import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { BulbIcon, CheckBadgeIcon } from '@/components/rail-icons';
import { Colors, Radius, Shadow, Spacing } from '@/constants/theme';
import { useAuthStore } from '@/lib/auth';

const MAX_LENGTH = 2000;

export function RecommendationModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const sendRecommendation = useAuthStore((s) => s.sendRecommendation);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Reset to a blank draft every time the modal reopens, rather than once
  // on mount — CommentsModal follows the same "visible flips true" reset
  // pattern for the same reason (the component stays mounted between opens).
  useEffect(() => {
    if (visible) {
      setMessage('');
      setSending(false);
      setSent(false);
      setErrorMsg(null);
    }
  }, [visible]);

  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1.08, { duration: 900 }), -1, true);
  }, [pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  const handleSend = async () => {
    const text = message.trim();
    if (!text || sending) return;
    setSending(true);
    setErrorMsg(null);
    const err = await sendRecommendation(text);
    setSending(false);
    if (err) {
      setErrorMsg(err);
      return;
    }
    setSent(true);
  };

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.card}>
          <LinearGradient colors={[Colors.accent, Colors.accent2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
            <Animated.View style={[styles.bulbWrap, !sent && pulseStyle]}>
              <BulbIcon size={26} color="#fff" />
            </Animated.View>
            <Text style={styles.headerTitle}>{sent ? 'Thanks for that!' : 'Got a recommendation?'}</Text>
            <Text style={styles.headerSubtitle}>
              {sent ? 'Your note is on its way to the Gumpa team. We read every one.' : 'A feature idea, a rough edge, anything at all, tell us.'}
            </Text>
          </LinearGradient>

          {sent ? (
            <View style={styles.doneBody}>
              <CheckBadgeIcon size={40} color={Colors.green} />
              <Pressable testID="recommendation-close-button" style={styles.primaryBtn} onPress={onClose}>
                <Text style={styles.primaryBtnText}>Close</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.body}>
              <TextInput
                testID="recommendation-input"
                style={styles.input}
                placeholder="What would make Gumpa better?"
                placeholderTextColor={Colors.muted}
                value={message}
                onChangeText={setMessage}
                maxLength={MAX_LENGTH}
                multiline
                textAlignVertical="top"
                editable={!sending}
                autoFocus
              />
              <Text style={styles.counter}>
                {message.length}/{MAX_LENGTH}
              </Text>
              {errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}
              <View style={styles.actions}>
                <Pressable style={styles.cancelBtn} onPress={onClose} disabled={sending}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </Pressable>
                <Pressable
                  testID="recommendation-send-button"
                  style={[styles.primaryBtn, (!message.trim() || sending) && styles.primaryBtnDisabled]}
                  onPress={handleSend}
                  disabled={!message.trim() || sending}>
                  <Text style={styles.primaryBtnText}>{sending ? 'Sending…' : 'Send'}</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
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
  bulbWrap: {
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
  body: { padding: Spacing.four, gap: 8 },
  input: {
    minHeight: 120,
    backgroundColor: Colors.bg,
    borderWidth: 1.5,
    borderColor: Colors.line,
    borderRadius: Radius.sm,
    padding: 14,
    fontSize: 14.5,
    color: Colors.ink,
  },
  counter: { fontSize: 11, color: Colors.muted, textAlign: 'right' },
  errorText: { fontSize: 12.5, color: Colors.red, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  cancelBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: Colors.line,
    borderRadius: Radius.sm,
    paddingVertical: 13,
    alignItems: 'center',
  },
  cancelBtnText: { color: Colors.ink, fontWeight: '800', fontSize: 14.5 },
  primaryBtn: { flex: 1, backgroundColor: Colors.accent, borderRadius: Radius.sm, paddingVertical: 13, alignItems: 'center' },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 14.5 },
  doneBody: { padding: Spacing.four, alignItems: 'center', gap: 16 },
});
