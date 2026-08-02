// Gumpa — modal grid for picking a screenshot as challenge proof. Only
// ever lists assets from the OS's own screenshot classification/album (see
// listScreenshotCandidates in src/lib/photo.ts) — never the general camera
// roll, so a downloaded internet image can't be passed off as a screenshot.

import { Image } from 'expo-image';
import type * as MediaLibrary from 'expo-media-library';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Radius, Shadow, Spacing } from '@/constants/theme';
import { listScreenshotCandidates } from '@/lib/photo';

const NUM_COLUMNS = 3;

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; assets: MediaLibrary.Asset[] }
  | { status: 'denied' }
  | { status: 'no-screenshots-found' };

export function ScreenshotPicker({
  visible,
  onClose,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (asset: MediaLibrary.Asset) => void;
}) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    if (!visible) return;
    setState({ status: 'loading' });
    listScreenshotCandidates().then((result) => {
      if (result.status === 'ok') setState({ status: 'ready', assets: result.assets });
      else setState({ status: result.status });
    });
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Choose a screenshot</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>

          {state.status === 'loading' && (
            <View style={styles.centered}>
              <ActivityIndicator color={Colors.accent} />
            </View>
          )}

          {state.status === 'denied' && (
            <View style={styles.centered}>
              <Text style={styles.message}>Photo access is required to pick a screenshot.</Text>
            </View>
          )}

          {state.status === 'no-screenshots-found' && (
            <View style={styles.centered}>
              <Text style={styles.message}>No screenshots found on this device yet. Take one, then come back here.</Text>
            </View>
          )}

          {state.status === 'ready' && (
            <FlatList
              data={state.assets}
              keyExtractor={(a) => a.id}
              numColumns={NUM_COLUMNS}
              contentContainerStyle={styles.grid}
              renderItem={({ item }) => (
                <Pressable style={styles.thumbWrap} onPress={() => onSelect(item)}>
                  <Image source={{ uri: item.uri }} style={styles.thumb} contentFit="cover" />
                </Pressable>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const THUMB_GAP = 4;

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(17,18,20,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: Radius.card,
    borderTopRightRadius: Radius.card,
    maxHeight: '80%',
    paddingTop: Spacing.three,
    paddingBottom: Spacing.four,
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
  message: { fontSize: 14, color: Colors.muted, textAlign: 'center', lineHeight: 20 },
  grid: { paddingHorizontal: Spacing.four - THUMB_GAP },
  thumbWrap: { flex: 1 / NUM_COLUMNS, aspectRatio: 1, padding: THUMB_GAP },
  thumb: { flex: 1, borderRadius: Radius.sm, backgroundColor: Colors.line },
});
