import { router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';

export function BackButton() {
  return (
    <Pressable onPress={() => router.back()} style={styles.btn} hitSlop={8}>
      <Text style={styles.text}>‹ Back</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.pill,
    backgroundColor: Colors.accentSoft,
    marginBottom: Spacing.three,
  },
  text: { fontWeight: '800', fontSize: 13.5, color: Colors.ink },
});
